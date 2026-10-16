/** Existing builds own their persisted budget; only new builds accept the operator's input. */
export function buildSubmission(city: string, maxCalls: number, build: { city: string; maxCalls: number } | null, retry = false) {
  return { city, ...(build?.city === city ? {} : { maxCalls }), ...(retry ? { retry: true } : {}) };
}
