"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai";
import { useEffect, useMemo, useRef } from "react";
import { isClientTool, runCityTool, type ToolDeps } from "@/agents/run-tool";

/** City-tool calls allowed per user question (each one is a round trip to the model). */
export const MAX_TOOL_CALLS_PER_TURN = 10;

/** Tool calls in the assistant messages since the last user message. */
export function toolCallsThisTurn(messages: UIMessage[]): number {
  let n = 0;
  for (let i = messages.length - 1; i >= 0 && messages[i].role !== "user"; i--) {
    n += messages[i].parts.filter((p) => p.type.startsWith("tool-")).length;
  }
  return n;
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
      const output =
        toolCallsThisTurn(chat.messages) > MAX_TOOL_CALLS_PER_TURN
          ? { error: "That's enough lookups for one question. Answer now with what you have." }
          : await runCityTool(toolCall.toolName, toolCall.input, depsRef.current);
      // Not awaited (the AI SDK docs warn awaiting here can deadlock).
      void chat.addToolOutput({ tool: toolCall.toolName as never, toolCallId: toolCall.toolCallId, output: output as never });
    },
  });
  return chat;
}
