import type { Persona } from "@/agents/interview";
import type { OutsideAct } from "@/agents/outside-act";
import type { Area, CopilotAction } from "@/agents/tools";
import { chooseVenueEntity } from "@/render/placement";
import type { Action } from "@/sim/actions/schema";
import type { SimDigest } from "@/sim/digest";
import type { Frame } from "@/sim/frame";
import type { ResidentProfile } from "@/sim/resident";
import type { Spread, WhatIfResult } from "@/sim/whatif";
import { SCOUT_DEFAULTS } from "@/sim/worker/protocol";
import { sceneGenes } from "@/ui/area-tools";
import { areaName } from "@/ui/words";
import type { CityLayout } from "@/render/layout";
import type { World } from "@/world/schema";

// The co-pilot's view of the city, computed in the browser from the World, the latest frame and the
// last digest. Pure functions; results are small, named and JSON-friendly for the model.

export interface CityContext {
  world: World;
  frame: Frame;
  digest: SimDigest | null;
  layout: Pick<CityLayout, "center" | "bounds" | "cellX" | "cellZ">;
  /** Lineage id → scene name, once named (M6 scene namer). */
  sceneNames?: ReadonlyMap<number, string>;
}

export type ToolError = { error: string };

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const cellArea = (ctx: CityContext, cell: number) => areaName(ctx.layout, ctx.layout.cellX[cell], ctx.layout.cellZ[cell], ctx.world);
const venueName = (ctx: CityContext, v: number) => ctx.frame.venueLabels?.[v] ?? ctx.world.entities[ctx.frame.venueEntity[v]]?.name ?? `venue ${v}`;
const isEvent = (ctx: CityContext, v: number) => ctx.frame.venueExpires[v] >= 0;

export function sceneLabel(ctx: CityContext, id: number): string {
  const named = ctx.sceneNames?.get(id);
  if (named) return named;
  const top = ctx.digest?.scenes.find((s) => s.id === id)?.topEntities.slice(0, 2).map((e) => e.name);
  return top?.length ? `Scene ${id} (${top.join(", ")})` : `Scene ${id}`;
}

/** Top home neighbourhoods of a scene's members, most first. */
function homeAreas(ctx: CityContext, scene: number, limit = 3): string[] {
  const counts = new Map<string, number>();
  for (let i = 0; i < ctx.frame.scene.length; i++) {
    if (!ctx.frame.alive[i] || ctx.frame.scene[i] !== scene) continue;
    const a = cellArea(ctx, ctx.frame.homeCell[i]);
    counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, limit).map(([a]) => a);
}

export function citySummary(ctx: CityContext) {
  const { frame, digest, world } = ctx;
  const tpw = Math.max(1, frame.ticksPerWeek);
  return {
    city: world.city.name,
    tick: frame.tick,
    ticksPerWeek: tpw,
    week: Math.floor(frame.tick / tpw),
    residents: digest?.agents ?? Array.from(frame.alive).reduce((a, b) => a + b, 0),
    venues: digest?.venues,
    fidelity: digest ? round(digest.fidelity) : null,
    scenes: (digest?.scenes ?? []).map((s) => ({
      id: s.id,
      name: sceneLabel(ctx, s.id),
      size: s.size,
      tastes: s.topEntities.map((e) => ({ id: e.index, name: e.name, type: world.entities[e.index]?.type })),
      homes: homeAreas(ctx, s.id),
      splitFrom: s.parent,
    })),
    recentSceneEvents: (digest?.recentSceneEvents ?? []).slice(-5),
    recentActions: (digest?.recentActions ?? []).slice(-5).map((a) => ({ week: Math.floor(a.tick / tpw), action: a.action.type })),
  };
}

const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9぀-鿿 ]+/g, " ")
    .trim();

function matchScore(name: string, query: string): number {
  const n = norm(name);
  const q = norm(query);
  if (!q) return 0;
  if (n === q) return 4;
  if (n.startsWith(q)) return 3;
  if (n.includes(q)) return 2;
  const words = q.split(/\s+/);
  const hit = words.filter((w) => w.length > 1 && n.includes(w)).length;
  return hit > 0 ? hit / words.length : 0;
}

type Found =
  | { kind: "venue"; venue: number; name: string; venueKind?: string; area: string; open: boolean }
  | { kind: "place"; place: number; name: string; venueKind?: string; area?: string }
  | { kind: "artist" | "tag"; id: number; name: string }
  | { kind: "area"; name: string; cells: number };

export function find(ctx: CityContext, query: string, kind: "venue" | "place" | "artist" | "tag" | "area" | "any" = "any") {
  const { world, frame } = ctx;
  const scored: { score: number; item: Found }[] = [];
  const want = (k: Found["kind"]) => kind === "any" || kind === k;
  const inTable = new Set<number>();
  for (let v = 0; v < frame.nVenues; v++) {
    if (isEvent(ctx, v)) continue;
    const e = frame.venueEntity[v];
    inTable.add(e);
    if (!want("venue")) continue;
    const score = matchScore(world.entities[e].name, query);
    if (score > 0) {
      scored.push({
        score,
        item: { kind: "venue", venue: v, name: world.entities[e].name, venueKind: world.entities[e].kind, area: cellArea(ctx, frame.venueCell[v]), open: frame.venueOpen[v] === 1 },
      });
    }
  }
  world.entities.forEach((e, i) => {
    let score = 0;
    if (e.type === "place" && !inTable.has(i) && want("place")) {
      score = matchScore(e.name, query);
      if (score > 0) scored.push({ score, item: { kind: "place", place: i, name: e.name, venueKind: e.kind, area: e.area } });
    } else if ((e.type === "artist" || e.type === "tag") && want(e.type)) {
      score = matchScore(e.name, query);
      if (score > 0) scored.push({ score, item: { kind: e.type, id: i, name: e.name } });
    }
  });
  if (want("area")) {
    const areas = new Map<string, number>();
    for (const c of world.cells) if (c.area) areas.set(c.area, (areas.get(c.area) ?? 0) + 1);
    for (const [name, cells] of areas) {
      const score = matchScore(name, query);
      if (score > 0) scored.push({ score, item: { kind: "area", name, cells } });
    }
  }
  const results = scored.sort((a, b) => b.score - a.score || (a.item.name < b.item.name ? -1 : 1)).slice(0, 8).map((s) => s.item);
  return { query, results };
}

/**
 * Open permanent venues ranked by measured rolling weekly visits or by health, lowest first.
 */
export function listVenues(
  ctx: CityContext,
  opts: { kind?: string; area?: string; sort?: "busiest" | "struggling"; limit?: number } = {},
) {
  const { frame, world } = ctx;
  const area = opts.area ? norm(opts.area) : null;
  const rows = [];
  for (let v = 0; v < frame.nVenues; v++) {
    if (!frame.venueOpen[v] || isEvent(ctx, v)) continue;
    const e = world.entities[frame.venueEntity[v]];
    if (opts.kind && (e.kind ?? "other") !== opts.kind) continue;
    const where = cellArea(ctx, frame.venueCell[v]);
    if (area && norm(where) !== area) continue;
    rows.push({ venue: v, name: e.name, kind: e.kind ?? "other", area: where, health: round(frame.venueHealth[v]), weeklyVisits: frame.venueWeekVisits?.[v] ?? 0 });
  }
  const sort = opts.sort ?? "busiest";
  rows.sort((a, b) => (sort === "busiest" ? b.weeklyVisits - a.weeklyVisits : a.health - b.health) || a.venue - b.venue);
  return { sort, total: rows.length, venues: rows.slice(0, opts.limit ?? 5) };
}

export function venueInfo(ctx: CityContext, v: number) {
  const { frame, world } = ctx;
  if (!(Number.isInteger(v) && v >= 0 && v < frame.nVenues)) return { error: `No venue ${v}. Use find to get venue ids.` };
  const e = world.entities[frame.venueEntity[v]];
  const crowd = new Map<number, number>();
  for (let i = 0; i < frame.attendance.length; i++) {
    if (frame.attendance[i] !== v || frame.scene[i] < 0) continue;
    crowd.set(frame.scene[i], (crowd.get(frame.scene[i]) ?? 0) + 1);
  }
  return {
    venue: v,
    name: e.name,
    kind: e.kind ?? "other",
    area: cellArea(ctx, frame.venueCell[v]),
    open: frame.venueOpen[v] === 1,
    event: isEvent(ctx, v),
    health: round(frame.venueHealth[v]),
    visitorsTonight: frame.venueAttendance[v],
    weeklyVisits: frame.venueWeekVisits?.[v] ?? null,
    capacity: frame.venueCapacity?.[v] ?? e.capacity ?? null,
    rent: frame.venueRent?.[v] ?? null,
    effectiveCapacity: frame.venueCapacity && frame.venueRent ? round(frame.venueCapacity[v] * frame.venueRent[v]) : null,
    lowWeeks: frame.venueLowTicks ? round(frame.venueLowTicks[v] / frame.ticksPerWeek) : null,
    closure: frame.venueClosures?.[v] ?? null,
    tonightsScenes: [...crowd].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([scene, n]) => ({ scene, name: sceneLabel(ctx, scene), visitors: n })),
    identityScene: frame.venueScene[v] >= 0 ? { scene: frame.venueScene[v], name: sceneLabel(ctx, frame.venueScene[v]) } : null,
    tastes: e.tags.slice(0, 8).map((t) => world.entities.find((x) => x.id === t)?.name ?? t),
  };
}

export function sceneInfo(ctx: CityContext, id: number) {
  const s = ctx.digest?.scenes.find((x) => x.id === id);
  if (!s) return { error: `No live scene ${id}. Use city_summary for scene ids.` };
  const venues = new Map<number, number>();
  for (let i = 0; i < ctx.frame.attendance.length; i++) {
    const v = ctx.frame.attendance[i];
    if (ctx.frame.scene[i] === id && v >= 0) venues.set(v, (venues.get(v) ?? 0) + 1);
  }
  return {
    scene: id,
    name: sceneLabel(ctx, id),
    size: s.size,
    tastes: s.topEntities.map((e) => ({ id: e.index, name: e.name, type: ctx.world.entities[e.index]?.type })),
    homes: homeAreas(ctx, id, 5),
    goesTonightTo: [...venues].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([v, n]) => ({ venue: v, name: venueName(ctx, v), visitors: n })),
    splitFrom: s.parent,
    bornWeek: Math.floor(s.bornTick / Math.max(1, ctx.frame.ticksPerWeek)),
  };
}

/** Cells for an area: the neighbourhood's cells, or the cell of a venue (and its immediate surroundings). */
export function resolveArea(ctx: CityContext, area: Area): number[] | ToolError {
  if (area.near_venue !== undefined) {
    if (!(area.near_venue >= 0 && area.near_venue < ctx.frame.nVenues)) return { error: `No venue ${area.near_venue}` };
    return [ctx.frame.venueCell[area.near_venue]];
  }
  const name = norm(area.name ?? "");
  const cells = ctx.world.cells.flatMap((c, i) => (c.area && norm(c.area) === name ? [i] : []));
  if (cells.length === 0) return { error: `Unknown area "${area.name}". Use find with kind "area".` };
  return cells;
}

/** The single best cell of an area to put something in: its busiest (densest) cell. */
function primaryCell(ctx: CityContext, cells: number[]): number {
  return cells.reduce((best, c) => (ctx.world.cells[c].density > ctx.world.cells[best].density ? c : best), cells[0]);
}

/** Maps co-pilot actions to simulation actions, or explains what's wrong. */
export function toSimActions(
  ctx: CityContext,
  actions: CopilotAction[],
  /** Outside artists already looked up (by the name the model used). */
  outside: ReadonlyMap<string, OutsideAct> = new Map(),
): { actions: Action[] } | ToolError {
  const { world, frame, digest } = ctx;
  const out: Action[] = [];
  for (const a of actions) {
    if (a.do === "cancel_event") {
      const e = frame.scheduledEvents?.find((e) => e.id === a.event);
      if (!e || (e.status !== "scheduled" && e.status !== "started")) return { error: "Booking is not scheduled or running" };
      out.push({ type: "cancelEvent", event: a.event });
      continue;
    }
    if (a.do === "close_venue") {
      if (!(a.venue >= 0 && a.venue < frame.nVenues) || isEvent(ctx, a.venue)) return { error: `No permanent venue ${a.venue}` };
      if (!frame.venueOpen[a.venue]) return { error: `${venueName(ctx, a.venue)} is already closed` };
      out.push({ type: "closeVenue", venue: a.venue });
      continue;
    }
    const cells = resolveArea(ctx, a.area);
    if ("error" in cells) return cells;
    if (a.do === "open_venue") {
      const cell = primaryCell(ctx, cells);
      const entity = a.place ?? chooseVenueEntity(world, a.kind, cell);
      if (world.entities[entity]?.type !== "place") return { error: `Place ${entity} is not a place. Use find with kind "place".` };
      out.push({ type: "openVenue", entity, cell });
    } else if (a.do === "throw_event") {
      const { reachKm, capacity } = SCOUT_DEFAULTS;
      const base = { type: "scheduleEvent" as const, cell: primaryCell(ctx, cells), duration: a.weeks ?? 3, startTick: a.start_tick, durationDays: a.nights, label: a.outside_artist ?? (a.artist !== undefined ? world.entities[a.artist]?.name : undefined), reachKm, capacity };
      if (a.outside_artist !== undefined) {
        const act = outside.get(a.outside_artist);
        if (!act) return { error: `Couldn't look up "${a.outside_artist}" in Qloo.` };
        out.push(act.inCity !== null ? { ...base, entity: act.inCity } : { ...base, entity: act.proxy, profile: act.profile });
        continue;
      }
      if (a.artist === undefined || world.entities[a.artist]?.type !== "artist") {
        return { error: `Give an artist id from find (kind "artist"), or outside_artist with a name for an artist not in this city.` };
      }
      out.push({ ...base, entity: a.artist });
    } else if (a.do === "rent_pressure") {
      out.push({ type: "rentPressure", cells, magnitude: a.magnitude });
    } else {
      const scene = digest?.scenes.find((s) => s.id === a.like_scene);
      if (!scene) return { error: `No live scene ${a.like_scene}` };
      out.push({
        type: "migrate",
        count: a.count,
        cells,
        genes: sceneGenes(scene),
      });
    }
  }
  return { actions: out };
}

/** First names for simulated residents, picked by agent id (varied, city-neutral). */
const FIRST_NAMES = [
  "Sam", "Priya", "Tom", "Aisha", "Wei", "Maya", "Leo", "Nadia", "Kofi", "Hana", "Ravi", "Zoe", "Omar", "Mei", "Jack", "Lina",
  "Arjun", "Chloe", "Daniel", "Siti", "Marcus", "Ines", "Ben", "Yuki", "Theo", "Amara", "Luca", "Farah", "Ethan", "Rosa",
];

/** An interview persona for a resident: name, home, scene and tastes as real names. */
export function personaOf(ctx: CityContext, profile: ResidentProfile): Persona {
  const isAge = (id: string) => id.startsWith("urn:tag:age_range:");
  const ageTag = profile.genes.map((g) => ctx.world.entities[g.entity]).find((e) => e && isAge(e.id));
  const tastes = profile.genes
    .map((g) => ctx.world.entities[g.entity])
    .filter((e) => e && !isAge(e.id))
    .slice(0, 12)
    .map((e) => ({ name: e.name, kind: e.type === "place" ? `${e.kind ?? "place"}` : e.type }));
  return {
    name: FIRST_NAMES[profile.agent % FIRST_NAMES.length],
    city: ctx.world.city.name,
    area: cellArea(ctx, profile.homeCell),
    scene: profile.scene >= 0 ? sceneLabel(ctx, profile.scene) : undefined,
    age: ageTag ? ageTag.name.replace(/^Ages\s+/, "") : undefined,
    tastes: tastes.length > 0 ? tastes : [{ name: "going out", kind: "habit" }],
    wentTo: profile.venue >= 0 && profile.venue < ctx.frame.nVenues ? venueName(ctx, profile.venue) : undefined,
  };
}

/** A what-if result with names, rounded, for the model. */
/** "−30 (range −38 to −22)", or just "−30" when every run agreed exactly. */
function changeText(c: Spread): string {
  const f = (x: number) => (x > 0 ? `+${Math.round(x)}` : `${Math.round(x)}`);
  return Math.round(c.min) === Math.round(c.max) ? f(c.mean) : `${f(c.mean)} (range ${f(c.min)} to ${f(c.max)})`;
}

/** Whether a change is clear across runs: every run agrees on its direction. */
const clear = (c: Spread) => (c.min > 0 || c.max < 0 ? "clear" : "too small to call");

/** A what-if result with names, rounded, for the model. Changes are mean (range) over paired runs. */
export function describeWhatIf(ctx: CityContext, r: WhatIfResult) {
  const name = (entity: number) => ctx.world.entities[entity]?.name ?? `#${entity}`;
  const shift = (x: WhatIfResult["winners"][number]) => ({
    venue: name(x.entity),
    withoutChange: Math.round(x.baseline),
    withChange: Math.round(x.scenario),
    change: changeText(x.change),
    verdict: x.consistent ? "clear" : "too small to call",
  });
  const venueNames = (rows: { venue: number; runs: number }[]) =>
    rows.map((row) => ({ venue: row.venue < ctx.frame.nVenues ? venueName(ctx, row.venue) : `new venue ${row.venue}`, inRuns: `${row.runs} of ${r.runs}` }));
  return {
    weeks: r.weeks,
    runs: r.runs,
    actionsApplied: r.actions.map((a) => (a.ok ? "ok" : a.error)),
    scenes: r.scenes.map((s) => ({
      scene: s.id,
      name: sceneLabel(ctx, s.id),
      now: s.before,
      withoutChange: Math.round(s.baseline),
      withChange: Math.round(s.scenario),
      change: changeText(s.change),
      verdict: clear(s.change),
    })),
    newScenesWithChange: r.newScenes.scenario.map((s) => ({ size: s.size, tastes: s.topEntities.slice(0, 3).map(name) })),
    newScenesWithoutChange: r.newScenes.baseline.map((s) => ({ size: s.size, tastes: s.topEntities.slice(0, 3).map(name) })),
    venuesThatCloseOnlyWithChange: venueNames(r.venues.closedOnlyInScenario),
    venuesThatSurviveOnlyWithChange: venueNames(r.venues.closedOnlyInBaseline),
    biggestGainers: r.winners.map(shift),
    biggestLosers: r.losers.map(shift),
    headlinerFans: r.fans.map((f) => ({ artist: name(f.entity), now: f.before, withoutChange: Math.round(f.baseline), withChange: Math.round(f.scenario), change: changeText(f.change), verdict: clear(f.change) })),
    fidelity: { withoutChange: round(r.fidelity.baseline), withChange: round(r.fidelity.scenario) },
    note: `Each comparison was run ${r.runs} times with different random seeds. Changes are the average with the range across runs; "clear" means every run moved the same way, "too small to call" means runs disagreed. Report clear effects confidently and say plainly when an effect is too small to call. Visits are totals over the simulated weeks.`,
  };
}
