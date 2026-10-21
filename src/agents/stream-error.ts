/** Public stream errors must not repeat provider account IDs, raw payloads or credentials. */
export function agentStreamError(error: unknown): string {
  if (error && typeof error === "object" && "statusCode" in error && error.statusCode === 429) {
    return "The language-model provider's rate limit was reached. Wait about a minute before asking again. Venue comparisons and city tools still work.";
  }
  return "The co-pilot hit a problem talking to the language model. Try again in a moment.";
}
