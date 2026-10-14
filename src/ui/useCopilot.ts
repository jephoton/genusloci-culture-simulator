"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai";
import { useEffect, useMemo, useRef } from "react";
import { isClientTool, runCityTool, type ToolDeps } from "@/agents/run-tool";

/**
 * Tool calls allowed per user question (each is a round trip to the model): lookups are cheap but add
 * up; what-ifs are the point, so they have their own allowance.
 */
export const TURN_LIMITS = { lookups: 12, simulations: 4 } as const;
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
  return firstUser > 0 ? tail.slice(firstUser) : tail;
}

/**
 * The co-pilot chat. City tools run here, against the simulation (`deps`); the server runs the model
 * and the Qloo tools. Results go back automatically until the model answers.
 */
export function useCopilot(city: string, deps: ToolDeps) {
  const depsRef = useRef(deps);
  useEffect(() => {
    depsRef.current = deps;
  });
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/copilot",
        prepareSendMessagesRequest: ({ messages }) => ({ body: { messages: recentMessages(messages), city } }),
      }),
    [city],
  );
  const chat = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    async onToolCall({ toolCall }) {
      if (toolCall.dynamic || !isClientTool(toolCall.toolName)) return;
      const output = overTurnLimit(chat.messages, toolCall.toolName)
        ? { error: "That's enough of this kind of call for one question. Answer now with what you have." }
        : await runCityTool(toolCall.toolName, toolCall.input, depsRef.current);
      // Not awaited (the AI SDK docs warn awaiting here can deadlock).
      void chat.addToolOutput({ tool: toolCall.toolName as never, toolCallId: toolCall.toolCallId, output: output as never });
    },
  });
  return chat;
}
