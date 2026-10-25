"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { type FormEvent, useMemo, useState } from "react";
import type { RaceContext } from "@/agents/race-helper";
import { useAgentAvailability } from "@/ui/useAgentAvailability";

/** Questions worth asking at each step of the race. */
export function suggestedQuestions(context: RaceContext): string[] {
  const winner = context.race?.result?.winner;
  switch (context.step) {
    case "artist": return ["How does Qloo pick the venues?"];
    case "venues": return ["Why these three venues?", "What decides who wins?"];
    case "race": return ["Why is one venue ahead?"];
    case "result": return [winner ? `Why did ${winner} win?` : "Why was it so close?", "How sure is this result?", "What should I try next?"];
  }
}

/** A collapsed helper that explains the current race. It reads the race; it never changes it. */
export function RaceHelper({ city, context }: { city: string; context: RaceContext }) {
  const configured = useAgentAvailability();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/race-helper",
    // The race context travels with each question (see `ask`), so answers follow the race as it changes.
    prepareSendMessagesRequest: ({ messages, body }) => ({ body: { ...body, messages: messages.slice(-12), city } }),
  }), [city]);
  const chat = useChat({ transport });
  const busy = chat.status === "submitted" || chat.status === "streaming";
  const ask = (text: string) => {
    if (!text.trim() || busy) return;
    chat.clearError();
    void chat.sendMessage({ text: text.trim() }, { body: { context } });
    setDraft("");
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    ask(draft);
  };

  if (configured === false) return null;
  return (
    <div className="border-t border-white/10 pt-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-xs text-zinc-300 hover:text-zinc-50">
        <span>Ask about this race</span>
        <span aria-hidden>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2 text-xs">
          {chat.messages.length > 0 && (
            <ul aria-live="polite" className="max-h-48 space-y-2 overflow-y-auto">
              {chat.messages.map((m) => {
                const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("").trim();
                if (!text) return null;
                return <li key={m.id} className={m.role === "user" ? "text-right text-violet-200" : "whitespace-pre-wrap text-zinc-200"}>{text}</li>;
              })}
              {busy && <li className="text-zinc-500">Thinking…</li>}
            </ul>
          )}
          <div className="flex flex-wrap gap-1.5">
            {suggestedQuestions(context).map((q) => (
              <button key={q} type="button" disabled={busy} onClick={() => ask(q)} className="rounded-full border border-white/15 px-2 py-0.5 text-zinc-300 hover:bg-white/10 disabled:opacity-40">{q}</button>
            ))}
          </div>
          <form onSubmit={submit} className="flex gap-2">
            <input aria-label="Question about this race" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={300} placeholder="Ask anything about this race" className="min-w-0 flex-1 rounded bg-zinc-900 px-2 py-1.5 text-zinc-100" />
            <button type="submit" disabled={busy || !draft.trim()} className="rounded bg-white/10 px-2 py-1.5 hover:bg-white/15 disabled:opacity-40">Ask</button>
          </form>
          {chat.error && <p role="alert" className="text-rose-300">{chat.error.message.startsWith("{") ? "The guide couldn't answer just now. Try again in a moment." : chat.error.message}</p>}
          <p className="text-[10px] text-zinc-500">AI answers from this race&apos;s numbers and Qloo; it can be wrong.</p>
        </div>
      )}
    </div>
  );
}
