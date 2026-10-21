"use client";

import { useEffect, useId, useRef, useState } from "react";

/** Editable combobox: suggestions stay local; only the parent's Add action queries Qloo. */
export function ArtistPicker({ value, onChange, artists, disabled, placeholder, outsideHint = "No city match. Use Add to look up this artist in Qloo." }: {
  outsideHint?: string;
  value: string;
  onChange: (value: string) => void;
  artists: readonly { i: number; name: string }[];
  disabled: boolean;
  placeholder: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const matches = artists.filter((a) => a.name.toLowerCase().includes(value.trim().toLowerCase()));
  const expanded = open && !disabled;
  const activeIndex = matches.findIndex((a) => a.i === active);
  useEffect(() => {
    if (expanded && active !== null) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, expanded, id]);
  const select = (name: string) => {
    onChange(name);
    setOpen(false);
    setActive(null);
    input.current?.focus();
  };
  return (
    <div className="min-w-0 flex-1" onBlur={(e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) { setOpen(false); setActive(null); }
    }}>
      <input ref={input} role="combobox" aria-label="Add an artist" aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? `${id}-list` : undefined} aria-activedescendant={expanded && activeIndex >= 0 ? `${id}-${active}` : undefined}
        autoComplete="off" value={value} disabled={disabled} placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => { onChange(e.target.value); setActive(null); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.preventDefault(); e.stopPropagation(); setOpen(false); setActive(null);
          } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault(); setOpen(true);
            if (!matches.length) return;
            const next = e.key === "ArrowDown" ? (activeIndex + 1) % matches.length : (activeIndex <= 0 ? matches.length - 1 : activeIndex - 1);
            setActive(matches[next].i);
          } else if (e.key === "Enter" && expanded && activeIndex >= 0) {
            e.preventDefault(); select(matches[activeIndex].name);
          } else if (e.key === "Enter") {
            // Free text still submits through Add, including outside artists.
            setOpen(false); setActive(null);
          }
        }}
        className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm outline-none ring-violet-400/50 placeholder:text-zinc-500 focus:border-violet-400/50 focus:ring-1 disabled:opacity-50" />
      {expanded && (
        <div className="mt-1 overflow-hidden rounded-lg border border-white/15 bg-[#171820] shadow-xl">
          <p className="border-b border-white/5 px-3 py-2 text-[10px] uppercase tracking-widest text-zinc-500">Artists in this city</p>
          <ul id={`${id}-list`} role="listbox" aria-label="Artist suggestions" className="max-h-40 overflow-y-auto py-1">
            {matches.map((a) => <li key={a.i} role="presentation"><button id={`${id}-${a.i}`} role="option" aria-selected={active === a.i} tabIndex={-1} type="button"
              onMouseDown={(e) => e.preventDefault()} onClick={() => select(a.name)}
              className={`block w-full px-3 py-2 text-left text-xs transition ${active === a.i ? "bg-violet-500/25 text-violet-100" : "text-zinc-300 hover:bg-white/10 hover:text-zinc-50"}`}>{a.name}</button></li>)}
          </ul>
          {!matches.length && <p className="px-3 pb-3 text-xs text-zinc-400">{outsideHint}</p>}
        </div>
      )}
    </div>
  );
}
