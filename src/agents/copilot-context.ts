import type { UIMessage } from "ai";

/** Approximate character budget, not a provider tokenizer or a promise to fit its TPM limit. */
export const CONTEXT_CHAR_BUDGET = 10000;

/** Drop complete old user turns; never split the active tool call/result sequence. */
export function compactMessages(messages: UIMessage[], budget = CONTEXT_CHAR_BUDGET): UIMessage[] {
  const clean = messages.filter((m) => m.role !== "system").map((m) => ({
    id: m.id,
    role: m.role,
    parts: m.parts.filter((p) => p.type === "text" || p.type.startsWith("tool-") || (p.type === "reasoning" && p.providerMetadata)).map((p) =>
      // Tool signatures and signed reasoning can be required by a provider on continuation.
      p.type === "text" ? Object.fromEntries(Object.entries(p).filter(([key]) => key !== "providerMetadata")) : p,
    ),
  })) as UIMessage[];
  while (JSON.stringify(clean).length > budget) {
    const nextUser = clean.findIndex((m, i) => i > 0 && m.role === "user");
    if (nextUser < 0) break;
    clean.splice(0, nextUser);
  }
  return clean;
}
