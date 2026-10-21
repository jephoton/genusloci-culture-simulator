import { expect, it } from "vitest";
import { rankArtistVenues } from "@/ui/event-planning";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";
import { initState } from "@/sim/state";
import { DEFAULT_CONFIG } from "@/sim/config";
import { buildFrame } from "@/sim/frame";

it("shortlists only open permanent hosts with real artist-affinity evidence", () => {
  const world = makeTinyWorld();
  const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 10 }, 1);
  const entity = s.venueEntity[0];
  const artist = world.entities.findIndex((e) => e.type === "artist");
  world.edges = [{ source: entity, target: artist, weight: 0.8 }];
  const { frame } = buildFrame(s, "main", 0, false, 0);
  const act = { key: "a", label: "Act", entity: artist };
  expect(rankArtistVenues(world, frame, act)[0]?.slot).toBe(0);
  frame.venueOpen[0] = 0;
  expect(rankArtistVenues(world, frame, act)).toEqual([]);
});

it("uses the outside artist's evidence profile rather than inventing affinity from its proxy", () => {
  const world = makeTinyWorld();
  const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 10 }, 1);
  const { frame } = buildFrame(s, "main", 0, false, 0);
  world.edges = [{ source: frame.venueEntity[0], target: 5, weight: 1 }];
  expect(rankArtistVenues(world, frame, { key: "outside", label: "Outside", entity: 5, profile: [{ entity: 6, weight: 1 }] })).toEqual([]);
});
