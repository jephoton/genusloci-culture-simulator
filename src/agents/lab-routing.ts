/** Playback requests describe manual controls without operating them. */
export function playbackGuidance(text: string, caseComplete: boolean): string | null {
  const command = text.trim().replace(/^please\s+/i, "").replace(/[.!?]+$/, "");
  if (/^(?:play|start|resume)(?: (?:the )?(?:simulation|city))?$/i.test(command)) return caseComplete
    ? "This case is complete. Click Exit case/view, then click Play in the bottom playback controls to continue the city."
    : "Click Play in the bottom playback controls when you are ready. You control when playback starts.";
  if (/^(?:pause|stop)(?: (?:the )?(?:simulation|city))?$/i.test(command)) return "Click Pause in the bottom playback controls when you want to stop. This message does not change playback.";
  if (/^(?:finish|end|exit) (?:the )?(?:case|view)$/i.test(command)) return "Click Exit case/view to leave the highlight and pause the city. Applied changes remain; use Change history to rewind them.";
  return null;
}

/** Explicit writes stay local; asking about a change is an AI-first question. */
export function isComparisonQuestion(text: string): boolean {
  return /\b(?:what (?:happens )?if|simulate|compare|comparison)\b/i.test(text) || /^(?:please\s+)?(?:close|open|raise rent)\b.*\?[?.!]*$/i.test(text.trim());
}

export function isDirectLocalCommand(text: string): boolean {
  const normalized = text.normalize("NFKC").trim().replace(/^please\s+/i, "");
  if (/\?[?.!]*$/.test(normalized)) return false;
  return /^(?:close |open |raise rent )/i.test(normalized) || /^(?:apply that(?: live)?|make that change(?: live)?|change live)[.!]*$/i.test(normalized);
}

/** AI is read-only, so its exhausted chain can safely fall back to local interpretation. */
export async function runQuestionWithFallback<T>(sendAI: () => Promise<boolean>, runLocal: () => Promise<T>): Promise<{ source: "ai" } | { source: "local"; result: T }> {
  try { if (await sendAI()) return { source: "ai" }; } catch { /* use bounded local language */ }
  return { source: "local", result: await runLocal() };
}
