import { expect, it } from "vitest";
import { buildSubmission } from "./build-console-state";
it("continues and retries persisted builds without changing their immutable budget", () => {
  expect(buildSubmission("london", 120, { city: "london", maxCalls: 80 })).toEqual({ city: "london" });
  expect(buildSubmission("london", 120, { city: "london", maxCalls: 80 }, true)).toEqual({ city: "london", retry: true });
});
it("uses the selected budget only for a new city's build", () => {
  expect(buildSubmission("paris", 90, { city: "london", maxCalls: 80 })).toEqual({ city: "paris", maxCalls: 90 });
  expect(buildSubmission("paris", 90, null)).toEqual({ city: "paris", maxCalls: 90 });
});
