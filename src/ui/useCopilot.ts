"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { compactMessages } from "@/agents/copilot-context";
import { retrySecondsFromMessage } from "@/agents/stream-error";
import { isClientTool, runCityTool, type ToolDeps } from "@/agents/run-tool";

/**
 * Tool calls allowed per user question (each is a round trip to the model): lookups are cheap but add
 * up; what-ifs are the point, so they have their own allowance.
 */
export const TURN_LIMITS = { lookups: 6, simulations: 2 } as const;
const SIMULATION_TOOLS = new Set(["tool-what_if", "tool-apply"]);

/** Tool calls in the assistant messages since the last user message, by allowance. */
export function toolCallsThisTurn(messages: UIMessage[]): { lookups: number; simulations: number } {
  const n = { lookups: 0, simulations: 0 };
  for (let i = messages.length - 1; i >= 0 && messages[i].role !== "user"; i--) {
    for (const p of messages[i].parts) {
      if (!p.type.startsWith("tool-")) continue;
      if (SIMULATION_TOOLS.has(p.type)) n.simulations++;
      else n.lookups++;
    }
  }
  return n;
}

/** Whether this call goes over its allowance (`messages` already include the call being made). */
export function overTurnLimit(messages: UIMessage[], toolName: string): boolean {
  const n = toolCallsThisTurn(messages);
  return SIMULATION_TOOLS.has(`tool-${toolName}`) ? n.simulations > TURN_LIMITS.simulations : n.lookups > TURN_LIMITS.lookups;
}

/** Messages sent per request: the recent conversation, cut at a user turn so tool calls stay paired. */
const MAX_MESSAGES = 40;

export function recentMessages(messages: UIMessage[], max = MAX_MESSAGES): UIMessage[] {
  if (messages.length <= max) return messages;
  const tail = messages.slice(-max);
  const firstUser = tail.findIndex((m) => m.role === "user");
  if (firstUser >= 0) return tail.slice(firstUser);
  const lastUser = messages.findLastIndex((m) => m.role === "user");
  return lastUser >= 0 ? messages.slice(lastUser) : messages;
}

/** Tool-call IDs are execution keys, including when a transport redelivers the call. */
export function runToolOnce(ledger: Map<string, Promise<unknown>>, id: string, execute: () => Promise<unknown>): Promise<unknown> {
  const existing = ledger.get(id);
  if (existing) return existing;
  const result = execute();
  ledger.set(id, result);
  return result;
}

/**
 * The co-pilot chat. City tools run here, against the simulation (`deps`); the server runs the model
 * and the Qloo tools. Results go back automatically until the model answers.
 */
export function useCopilot(city: string, deps: ToolDeps) {
  const depsRef = useRef(deps);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const cooldownRef = useRef(0);
  const executed = useRef(new Map<string, Promise<unknown>>());
  const epoch = useRef(0);
  const failures = useRef(0);
  const coolDown = useCallback((seconds: number) => {
    cooldownRef.current = Math.max(cooldownRef.current, Date.now() + seconds * 1000);
    setCooldownUntil(cooldownRef.current);
  }, []);
  useEffect(() => {
    depsRef.current = deps;
  });
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/copilot",
        prepareSendMessagesRequest: ({ messages }) => ({ body: { messages: compactMessages(recentMessages(messages)), city } }),
      }),
    [city],
  );
  const chat = useChat({
    transport,
    sendAutomaticallyWhen: (options) => Date.now() >= cooldownRef.current && lastAssistantMessageIsCompleteWithToolCalls(options),
    onError: (error) => {
      failures.current++;
      const seconds = retrySecondsFromMessage(error.message);
      if (seconds !== null) coolDown(seconds);
    },
    onFinish: ({ isAbort, isDisconnect }) => { if (isAbort || isDisconnect) failures.current++; },
    async onToolCall({ toolCall }) {
      if (toolCall.dynamic || !isClientTool(toolCall.toolName)) return;
      const generation = epoch.current;
      const output = await runToolOnce(executed.current, toolCall.toolCallId, () =>
        overTurnLimit(chat.messages, toolCall.toolName)
          ? Promise.resolve({ error: "That's enough of this kind of call for one question. Answer now with what you have." })
          : runCityTool(toolCall.toolName, toolCall.input, depsRef.current),
      );
      if (epoch.current !== generation) return;
      // Not awaited (the AI SDK docs warn awaiting here can deadlock).
      void chat.addToolOutput({ tool: toolCall.toolName as never, toolCallId: toolCall.toolCallId, output: output as never });
    },
  });
  const resetChat = () => {
    void chat.stop();
    epoch.current++;
    chat.setMessages([]);
    chat.clearError();
    // Keep the cooldown and execution ledger: clearing context must not bypass limits or replay actions.
  };
  return {
    ...chat,
    cooldownUntil,
    resetChat,
    sendMessage: async (...args: Parameters<typeof chat.sendMessage>) => {
      if (Date.now() < cooldownRef.current) return false;
      const before = failures.current;
      chat.clearError();
      await chat.sendMessage(...args);
      return failures.current === before;
    },
  };
}
