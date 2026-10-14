"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Persona } from "@/agents/interview";
import { friendlyError } from "@/ui/CopilotPanel";

const QUESTIONS = ["What's a good night out for you?", "How's the neighbourhood changing?", "What would you miss most if it closed?"];

/** A chat with one simulated resident. Keyed by the persona, so meeting someone new starts afresh. */
export function InterviewPanel({ persona, onAnother, onClose }: { persona: Persona; onAnother: () => void; onClose: () => void }) {
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/interview", prepareSendMessagesRequest: ({ messages }) => ({ body: { persona, messages: messages.slice(-20) } }) }),
    [persona],
  );
  const { messages, sendMessage, status, error, stop } = useChat({ transport });
  const [input, setInput] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);
  const send = (text: string) => {
    if (!text.trim() || busy) return;
    void sendMessage({ text: text.trim() });
    setInput("");
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    send(input);
  };
  return (
    <aside aria-label={`Interview with ${persona.name}`} className="panel pointer-events-auto absolute bottom-24 left-4 top-24 flex w-80 flex-col">
      <header className="space-y-1 border-b border-white/10 px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-medium">
              {persona.name}
              {persona.age ? `, ${persona.age}` : ""} · {persona.area}
            </h2>
            {persona.scene && <p className="text-xs text-zinc-400">{persona.scene}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="End the interview" className="rounded px-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100">
            ×
          </button>
        </div>
        <p className="text-xs text-zinc-400">
          Into {persona.tastes.slice(0, 4).map((t) => t.name).join(", ")}
          {persona.wentTo ? `. Last out at ${persona.wentTo}.` : "."}
        </p>
        <button type="button" onClick={onAnother} className="text-xs text-violet-200 underline-offset-2 hover:underline">
          Meet someone else from this scene
        </button>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 text-sm">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-zinc-400">A simulated resident built from real taste data. Ask:</p>
            {QUESTIONS.map((q) => (
              <button key={q} type="button" onClick={() => send(q)} className="block w-full rounded-lg border border-white/10 px-3 py-2 text-left hover:bg-white/5">
                {q}
              </button>
            ))}
          </div>
        )}
        {messages.map((m) => {
          const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
          return m.role === "user" ? (
            <div key={m.id} className="ml-8 rounded-lg bg-violet-500/20 px-3 py-2 text-violet-50">{text}</div>
          ) : (
            <p key={m.id} className="text-zinc-200"><span className="text-zinc-400">{persona.name}: </span>{text}</p>
          );
        })}
        {busy && <p className="text-xs text-zinc-500">{persona.name} is thinking…</p>}
        {error && <p role="alert" className="rounded-lg border border-rose-400/30 bg-rose-950/60 px-3 py-2 text-xs text-rose-100">{friendlyError(error)}</p>}
        <div ref={end} />
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t border-white/10 p-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask ${persona.name}…`}
          aria-label={`Ask ${persona.name}`}
          className="min-w-0 flex-1 rounded-md bg-white/5 px-2 py-1.5 text-sm outline-none ring-violet-400/50 focus:ring-1"
        />
        {busy ? (
          <button type="button" onClick={() => void stop()} className="rounded-md bg-white/10 px-3 text-sm">Stop</button>
        ) : (
          <button type="submit" disabled={!input.trim()} className="rounded-md bg-violet-500/80 px-3 text-sm disabled:opacity-40">Ask</button>
        )}
      </form>
    </aside>
  );
}
