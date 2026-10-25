/** Only safe, structured retry metadata crosses the public error boundary. */
export function providerRetrySeconds(error: unknown, now = Date.now()): number | null {
  if (!error || typeof error !== "object" || !("statusCode" in error) || error.statusCode !== 429) return null;
  const headers = "responseHeaders" in error ? error.responseHeaders as Record<string, string> | undefined : undefined;
  const value = headers?.["retry-after"] ?? headers?.["Retry-After"];
  if (!value) return 60;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds : (Date.parse(value) - now) / 1000;
  return Number.isFinite(delay) ? Math.max(1, Math.ceil(delay)) : 60;
}

export function retrySecondsFromMessage(message: string): number | null {
  const marker = /\[retry-after:(\d+)\]/.exec(message);
  if (marker) return Math.max(1, Number(marker[1]));
  try {
    const body = JSON.parse(message) as { retryAfter?: unknown };
    if (typeof body.retryAfter === "number" && Number.isFinite(body.retryAfter)) return Math.max(1, body.retryAfter);
  } catch { /* Transport errors need not be JSON. */ }
  return null;
}

/** Public stream errors must not repeat provider account IDs, raw payloads or credentials. */
export function agentStreamError(error: unknown): string {
  const seconds = providerRetrySeconds(error);
  if (seconds !== null) {
    return `The language-model provider's rate limit was reached. Wait ${seconds >= 60 ? `${Math.ceil(seconds / 60)} minute(s)` : `${seconds} seconds`} before asking again. City tools still work. [retry-after:${seconds}]`;
  }
  return "The co-pilot hit a problem talking to the language model. Try again in a moment.";
}
