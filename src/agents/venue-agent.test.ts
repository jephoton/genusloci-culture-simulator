import { MockLanguageModelV4 } from "ai/test";
import type { QlooClient } from "@/qloo/client";
import { describe, expect, it } from "vitest";
import { fallbackPicks, type PickBody, pickInstructions, pickVenues, possessive, readableTag } from "@/agents/venue-agent";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

const body: PickBody = {
  city: "London",
  near: { lat: 51.5, lon: -0.13, radiusM: 2000 },
  artist: "Test Artist",
  artistTags: ["grime", "uk rap"],
  candidates: [
    { id: "v0", qid: "q0", fansNearby: 30, name: "Club One", kind: "club", area: "Soho", qlooFit: 100, regulars: 3, tags: ["late night", "grime"] },
    { id: "v1", qid: "q1", fansNearby: 31, name: "Bar Two", kind: "bar", area: "Camden", qlooFit: 80, regulars: 20, tags: ["cocktails"] },
    { id: "v2", qid: "q2", fansNearby: 29, name: "Hall Three", kind: "music venue", area: "Brixton", qlooFit: 60, regulars: 9, tags: ["live music"] },
    { id: "v3", qid: "q3", fansNearby: 40, name: "Room Four", kind: "club", area: "Hackney", qlooFit: 50, regulars: 1, tags: [] },
  ],
};

/** A model that plays the given tool calls, one per step. */
function scripted(calls: { toolName: string; input: unknown }[]) {
  let step = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      const call = calls[step++];
      if (!call) return { content: [{ type: "text", text: "done" }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] };
      return { content: [{ type: "tool-call", toolCallId: `c${step}`, toolName: call.toolName, input: JSON.stringify(call.input) }], finishReason: { unified: "tool-calls", raw: undefined }, usage, warnings: [] };
    },
  });
}

describe("venue agent", () => {
  it("reads Qloo tag URNs as words and lists the shortlist without tags in its instructions", () => {
    expect(readableTag("urn:tag:genre:music:uk_garage")).toBe("uk garage");
    expect([possessive("Ku Bar"), possessive("Quaglino's"), possessive("Ronnie Scotts")]).toEqual(["Ku Bar's", "Quaglino's", "Ronnie Scotts'"]);
    const text = pickInstructions(body);
    expect(text).toContain("Club One");
    expect(text).not.toContain("cocktails");
  });

  it("inspects venues, then returns its choice with a plain trace", async () => {
    const model = scripted([
      { toolName: "artist_taste", input: {} },
      { toolName: "inspect_venue", input: { id: "v1" } },
      { toolName: "choose_venues", input: { picks: [{ id: "v1", reason: "Many regulars." }, { id: "v0", reason: "Best fit." }, { id: "v2", reason: "Live music crowd." }], summary: "Fit against footfall." } },
    ]);
    const r = await pickVenues({ model, body, qloo: null });
    expect(r.picks.map((p) => p.id)).toEqual(["v1", "v0", "v2"]);
    expect(r.summary).toBe("Fit against footfall.");
    expect(r.steps).toEqual([{ text: "Looked up Test Artist in Qloo: grime, uk rap" }, { text: "Checked Bar Two's Qloo tags: cocktails" }]);
  });

  it("drops unknown or repeated picks and fills up with the best Qloo fits", async () => {
    const model = scripted([{ toolName: "choose_venues", input: { picks: [{ id: "v9", reason: "Made up." }, { id: "v2", reason: "Good." }, { id: "v2", reason: "Again." }], summary: "" } }]);
    const r = await pickVenues({ model, body, qloo: null });
    expect(r.picks.map((p) => p.id)).toEqual(["v2", "v0", "v1"]);
    expect(r.steps.at(-1)?.text).toContain("next best matches");
  });

  it("falls back to the top fits when the model never chooses", async () => {
    const r = await pickVenues({ model: scripted([]), body, qloo: null });
    expect(r.picks.map((p) => p.id)).toEqual(["v0", "v1", "v2"]);
    expect(fallbackPicks({ ...body, candidates: body.candidates.slice(0, 2) })).toHaveLength(2);
  });

  it("asks Qloo live which of the city's venues the artist's fans like, and can pick one it found", async () => {
    let asked: unknown;
    const qloo = {
      search: async () => [{ id: "artist-q", name: "Test Artist", tags: [] }],
      places: async (opts: unknown) => {
        asked = opts;
        return [{ id: "elsewhere", name: "Not In City", tags: [], affinity: 0.9 }, { id: "q3", name: "Room Four", tags: [], affinity: 0.8 }];
      },
    } as unknown as QlooClient;
    const model = scripted([
      { toolName: "qloo_rank_venues", input: {} },
      { toolName: "choose_venues", input: { picks: [{ id: "v3", reason: "Qloo's live pick." }], summary: "Live Qloo found it." } },
    ]);
    const r = await pickVenues({ model, body, qloo });
    expect(asked).toMatchObject({ signalEntities: ["artist-q"], at: { lat: 51.5, lon: -0.13 }, radiusM: 2000 });
    expect(r.steps[0].text).toBe("Asked Qloo live which venues Test Artist's fans like: Room Four");
    expect(r.picks[0]).toEqual({ id: "v3", reason: "Qloo's live pick.", liveFit: 89 });
    // Swap options: the live find first, then the listed shortlist.
    expect(r.considered).toEqual(["v3", "v0", "v1", "v2"]);
  });
});
