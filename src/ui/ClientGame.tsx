"use client";

import dynamic from "next/dynamic";

const GameShell = dynamic(() => import("@/ui/GameShell"), {
  ssr: false,
  loading: () => <div className="grid h-dvh place-items-center bg-[#07080b] text-zinc-400">Growing the city…</div>,
});

export default function ClientGame() {
  return <GameShell />;
}
