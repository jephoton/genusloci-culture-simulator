"use client";

import type { UIMessage } from "ai";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";

const SUGGESTIONS = [
  "What scenes live here, and where?",
  "What happens if the busiest club closes?",
  "Where should I open a jazz bar?",
  "Which venues are struggling, and why?",
];

type ToolPart = { type: string; state?: string; input?: Record<string, unknown>; output?: unknown; errorText?: string };

/** A one-line, plain-English label for a tool step. */
export function toolLabel(part: ToolPart): string {
  const name = part.type.replace(/^tool-/, "");
  const i = part.input ?? {};
  const done = part.state === "output-available";
  switch (name) {
    case "city_summary":
      return done ? "Read the city" : "Reading the city…";
    case "find":
      return `Looked up “${String(i.query ?? "")}”`;
    case "venues":
      return i.sort === "struggling" ? "Ranked struggling venues" : "Ranked the busiest venues";
    case "venue":
      return "Checked a venue";
    case "scene":
      return "Checked a scene";
    case "what_if": {
      const weeks = Number(i.weeks ?? 8);
      return done ? `Simulated ${weeks} weeks, with and without the change` : `Simulating ${weeks} weeks…`;
    }
    case "apply":
      return done ? "Changed the live city" : "Changing the city…";
    case "qloo_search":
      return `Asked Qloo about “${String(i.name ?? "")}”`;
    case "qloo_taste":
      return `Asked Qloo what “${String(i.name ?? "")}” fans like`;
    default:
      return name;
  }
}

/** Minimal markdown: paragraphs, "- " bullet lists and **bold**. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((chunk, i) => (chunk.startsWith("**") && chunk.endsWith("**") ? <strong key={i}>{chunk.slice(2, -2)}</strong> : chunk));
}

function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length} className="ml-4 list-disc space-y-0.5">{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  for (const line of text.split("\n")) {
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (bullet) list.push(bullet[1]);
    else {
      flush();
      if (line.trim()) blocks.push(<p key={blocks.length}>{inline(line)}</p>);
    }
  }
  flush();
  return <div className="space-y-1.5">{blocks}</div>;
}

export function Message({ message }: { message: UIMessage }) {
  if (message.role === "user") {
    const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
    return <div className="ml-8 rounded-lg bg-violet-500/20 px-3 py-2 text-sm text-violet-50">{text}</div>;
  }
  return (
    <div className="space-y-1.5 text-sm text-zinc-200">
      {message.parts.map((p, i) => {
        if (p.type === "text") return <Markdown key={i} text={p.text} />;
        if (p.type.startsWith("tool-")) {
          const part = p as unknown as ToolPart;
          const failed = part.state === "output-error";
          return (
            <div key={i} className={`flex items-center gap-1.5 text-xs ${failed ? "text-rose-300" : "text-zinc-500"}`}>
              <span aria-hidden>{part.state === "output-available" ? "✓" : failed ? "!" : "…"}</span>
              {toolLabel(part)}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

export function CopilotPanel({
  city,
  messages,
  status,
  error,
  onSend,
  onStop,
  onClose,
  onReset,
  cooldownUntil = 0,
}: {
  city: string;
  messages: UIMessage[];
  status: "submitted" | "streaming" | "ready" | "error";
  error: Error | undefined;
  onSend: (text: string) => void;
  onStop: () => void;
  onClose: () => void;
  onReset?: () => void;
  cooldownUntil?: number;
}) {
  const [input, setInput] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const timer = setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= cooldownUntil) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil]);
  const coolingDown = cooldownUntil > now;
  const end = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || busy || coolingDown) return;
    onSend(input.trim());
    setInput("");
  };
  return (
    <aside id="workspace-drawer" aria-label="Co-pilot" className="panel pointer-events-auto absolute left-2 right-2 top-36 bottom-24 z-[5] sm:left-auto sm:right-4 sm:w-80 md:top-24 flex flex-col">
      <header className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div>
          <h2 className="text-sm font-medium">Co-pilot</h2>
          <p className="text-xs text-zinc-400">Ask about {city}, or test a change before you make it.</p>
        </div>
        <button data-drawer-close type="button" onClick={onClose} aria-label="Close the co-pilot" className="rounded px-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100">
          ×
        </button>
      </header>
      {onReset && messages.length > 0 && (
        <div className="border-b border-white/10 px-3 py-2 text-xs text-zinc-400">
          <button type="button" disabled={busy} onClick={onReset} className="text-violet-300 disabled:opacity-40">New chat</button>
          <p>Clears chat context to reduce token use. City changes remain; provider cooldown still applies.</p>
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-zinc-400">Try:</p>
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" disabled={coolingDown || busy} onClick={() => onSend(s)} className="block w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm hover:bg-white/5">
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m) => (
          <Message key={m.id} message={m} />
        ))}
        {coolingDown && <p role="status" className="text-xs text-amber-200">Provider cooldown: {Math.max(1, Math.ceil((cooldownUntil - now) / 1000))}s remaining. No automatic retry.</p>}
        {busy && <p className="text-xs text-zinc-500">Thinking…</p>}
        {error && (
          <p role="alert" className="rounded-lg border border-rose-400/30 bg-rose-950/60 px-3 py-2 text-xs text-rose-100">
            {friendlyError(error)}
          </p>
        )}
        <div ref={end} />
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t border-white/10 p-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="What happens if…"
          aria-label="Ask the co-pilot"
          className="min-w-0 flex-1 rounded-md bg-white/5 px-2 py-1.5 text-sm outline-none ring-violet-400/50 focus:ring-1"
        />
        {busy ? (
          <button type="button" onClick={onStop} className="rounded-md bg-white/10 px-3 text-sm">Stop</button>
        ) : (
          <button type="submit" disabled={!input.trim() || coolingDown} className="rounded-md bg-violet-500/80 px-3 text-sm disabled:opacity-40">Ask</button>
        )}
      </form>
    </aside>
  );
}

/** The route answers errors as JSON `{ error }`; the AI SDK surfaces the body as the message. */
export function friendlyError(e: Error): string {
  try {
    const body = JSON.parse(e.message) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // not JSON
  }
  return e.message.replace(/\s*\[retry-after:\d+\]/g, "") || "Something went wrong. Try again.";
}
