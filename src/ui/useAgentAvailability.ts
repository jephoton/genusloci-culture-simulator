"use client";

import { useEffect, useState } from "react";

/** null means checking/unknown, not a promise that a configured provider is healthy. */
export function useAgentAvailability(): boolean | null {
  const [configured, setConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/copilot", { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return;
        const body = await res.json();
        if (!controller.signal.aborted && typeof body.configured === "boolean") setConfigured(body.configured);
      }).catch(() => {});
    return () => controller.abort();
  }, []);
  return configured;
}
