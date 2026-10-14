import { describe, expect, it } from "vitest";
import { matchOutsideAct } from "@/agents/outside-act";
import type { QEntity, QTag } from "@/qloo/schemas";

// Synthetic entities (no Qloo data).
const world = {
  entities: [
    { id: "a-1", name: "Local Artist One", type: "artist" as const, tags: [], popularity: 0.5 },
    { id: "a-2", name: "Local Artist Two", type: "artist" as const, tags: [], popularity: 0.5 },
    { id: "urn:tag:genre:music:grime", name: "Grime", type: "tag" as const, tags: [], popularity: 0.5 },
    { id: "urn:tag:inclusivity:place:women_owned", name: "Identifies as women owned", type: "tag" as const, tags: [], popularity: 0.5 },
    { id: "p-1", name: "A Venue", type: "place" as const, tags: [], popularity: 0.5 },
  ],
};
const artist: QEntity = { id: "x-9", name: "Visiting Star", tags: [], description: "A touring act" };
const q = (id: string, affinity?: number): QEntity => ({ id, name: id, tags: [], affinity });
const tag = (id: string): QTag => ({ id, name: id });

describe("matchOutsideAct", () => {
  it("builds a taste profile from in-city similar artists and shared tags", () => {
    const m = matchOutsideAct(world, artist, [q("unknown"), q("a-2", 0.9), q("p-1"), q("a-1", 0.8)], [tag("urn:tag:inclusivity:place:women_owned"), tag("urn:tag:genre:music:grime"), tag("urn:tag:other")]);
    expect(m).not.toBeNull();
    expect(m!.inCity).toBeNull();
    expect(m!.similar.map((s) => s.name)).toEqual(["Local Artist Two", "Local Artist One"]); // places ignored
    expect(m!.tags.map((t) => t.name)).toEqual(["Grime"]);
    expect(m!.proxy).toBe(1);
    expect(m!.profile.map((p) => p.entity).sort()).toEqual([0, 1, 2]); // not the venue-ownership tag
    for (const p of m!.profile) expect(p.weight).toBeGreaterThan(0);
  });

  it("recognises an artist already in the city, and gives up when nothing connects", () => {
    expect(matchOutsideAct(world, { ...artist, id: "a-1" }, [], [])!.inCity).toBe(0);
    expect(matchOutsideAct(world, artist, [q("nobody")], [tag("urn:tag:nothing")])).toBeNull();
  });
});
