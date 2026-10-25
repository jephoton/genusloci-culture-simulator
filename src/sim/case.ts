import type { SimState } from "@/sim/state";

export type CaseSpec = { id: string; startTick: number; maxTicks: number; venueSlots: number[]; agentSlots: number[]; locations?: { entity: number; cell: number }[] };
export type CaseReport = {
  id: string; startTick: number; endTick: number;
  reason: "settled" | "limit" | "finished" | "interrupted";
  observedTicks: number; visits: number; uniqueVisitors: number; cohortOutings: number;
  venues: { venue: number; entity: number; cell: number; visits: number; healthBefore: number; healthAfter: number; openBefore: boolean; openAfter: boolean }[];
  settledHeuristic: boolean;
};

type TrackedVenue = CaseReport["venues"][number] & { expires: number; retired: boolean };
type Cycle = { visits: number; outings: number; destinations: Float64Array; health: number[]; structure: string; changed: boolean };

/** Observed activity only: the already-applied action tick and any causal baseline are excluded. */
export class CaseMonitor {
  readonly spec: CaseSpec;
  private lastTick: number;
  private readonly venues: TrackedVenue[];
  private readonly visitors: Uint8Array;
  private observedTicks = 0;
  private visits = 0;
  private uniqueVisitors = 0;
  private cohortOutings = 0;
  private cycleTicks = 0;
  private cycleVisits = 0;
  private cycleOutings = 0;
  private readonly cycleDestinations: Float64Array;
  private previous: Cycle | null = null;
  private stableComparisons = 0;
  private structure: string;
  private cycleChanged = false;
  private settled = false;

  constructor(s: SimState, spec: CaseSpec) {
    if (typeof spec.id !== "string" || !spec.id.trim() || spec.id.length > 200) throw new Error("invalid case id");
    if (!Number.isSafeInteger(spec.startTick) || spec.startTick < 0 || spec.startTick > s.tick) throw new Error("invalid case startTick");
    if (!Number.isSafeInteger(spec.maxTicks) || spec.maxTicks < 1 || spec.maxTicks > 10000 || !Number.isSafeInteger(spec.startTick + spec.maxTicks)) throw new Error("invalid case maxTicks");
    const slots = (value: number[], bound: number) => {
      if (!Array.isArray(value) || value.length > bound || new Set(value).size !== value.length || value.some((v) => !Number.isInteger(v) || v < 0 || v >= bound)) throw new Error("invalid case slots");
      return [...value];
    };
    const locations = spec.locations ?? [];
    if (!Array.isArray(locations) || locations.length > 5 || locations.some((l) => !l || !Number.isInteger(l.entity) || l.entity < 0 || l.entity >= s.cw.nEntities || !Number.isInteger(l.cell) || l.cell < 0 || l.cell >= s.cw.nCells)) throw new Error("invalid case locations");
    this.spec = { ...spec, venueSlots: slots(spec.venueSlots, s.nVenues), agentSlots: slots(spec.agentSlots, s.alive.length), locations: locations.map((l) => ({ ...l })) };
    this.lastTick = s.tick;
    this.visitors = new Uint8Array(s.alive.length);
    this.cycleDestinations = new Float64Array(s.venueEntity.length);
    this.venues = this.spec.venueSlots.map((venue) => this.captureVenue(s, venue));
    this.discover(s, new Map(this.venues.map((v) => [v.venue, v])));
    this.structure = this.structureOf(s);
  }

  private captureVenue(s: SimState, venue: number): TrackedVenue {
    return { venue, entity: s.venueEntity[venue], cell: s.venueCell[venue], expires: s.venueExpires[venue], visits: 0, healthBefore: s.venueHealth[venue], healthAfter: s.venueHealth[venue], openBefore: !!s.venueOpen[venue], openAfter: !!s.venueOpen[venue], retired: false };
  }

  /** Discover only open matches, avoiding historical closed venues and duplicate lifetimes. */
  private discover(s: SimState, tracked: Map<number, TrackedVenue>): void {
    if (!this.spec.locations?.length) return;
    for (let venue = 0; venue < s.nVenues; venue++) {
      if (!s.venueOpen[venue] || tracked.has(venue) || !this.spec.locations.some((l) => l.entity === s.venueEntity[venue] && l.cell === s.venueCell[venue])) continue;
      const entry = this.captureVenue(s, venue);
      this.venues.push(entry);
      tracked.set(venue, entry);
    }
  }

  private structureOf(s: SimState): string {
    return `${s.nVenues}|${s.alive.join(",")}|${Array.from({ length: s.nVenues }, (_, v) => `${s.venueEntity[v]}:${s.venueCell[v]}:${s.venueOpen[v]}:${s.venueExpires[v]}`).join(";")}|${s.scheduledEvents.filter((e) => e.status === "scheduled" || e.status === "started").map((e) => `${e.id}:${e.status}:${e.venue ?? -1}`).join(";")}`;
  }

  private relevantEventUnresolved(s: SimState): boolean {
    return s.scheduledEvents.some((event) => {
      if (event.status !== "scheduled" && event.status !== "started") return false;
      return this.spec.locations?.some((location) => location.entity === event.action.entity && location.cell === event.action.cell)
        || (event.action.hostVenue !== undefined && this.spec.venueSlots.includes(event.action.hostVenue))
        || (event.venue !== undefined && this.venues.some((venue) => !venue.retired && venue.venue === event.venue));
    });
  }

  completion(s: SimState): "settled" | "limit" | null {
    if (s.tick >= this.spec.startTick + this.spec.maxTicks) return "limit";
    return this.settled ? "settled" : null;
  }

  /** Call exactly once after each engine tick. Cycle/visitor storage is bounded by world slots;
   * report lifetime rows are bounded by the validated hard case cap and venue table size. */
  observe(s: SimState): "settled" | "limit" | null {
    if (s.tick !== this.lastTick + 1) throw new Error("case observations must be consecutive ticks");
    this.lastTick = s.tick;
    this.observedTicks++;
    const tracked = new Map<number, TrackedVenue>();
    for (const v of this.venues) {
      if (v.retired) continue;
      if (s.venueEntity[v.venue] !== v.entity || s.venueCell[v.venue] !== v.cell || s.venueExpires[v.venue] !== v.expires || (!v.openAfter && !!s.venueOpen[v.venue])) {
        v.retired = true;
        v.openAfter = false;
        continue;
      }
      tracked.set(v.venue, v);
      v.healthAfter = s.venueHealth[v.venue];
      v.openAfter = !!s.venueOpen[v.venue];
    }
    this.discover(s, tracked);
    for (let a = 0; a < s.alive.length; a++) {
      if (!s.alive[a] || s.attendance[a] < 0 || !tracked.has(s.attendance[a])) continue;
      this.visits++; this.cycleVisits++;
      tracked.get(s.attendance[a])!.visits++;
      if (!this.visitors[a]) { this.visitors[a] = 1; this.uniqueVisitors++; }
    }
    for (const a of this.spec.agentSlots) if (s.alive[a] && s.attendance[a] >= 0) {
      this.cohortOutings++; this.cycleOutings++;
      this.cycleDestinations[s.attendance[a]]++;
    }
    const structure = this.structureOf(s);
    if (structure !== this.structure) this.cycleChanged = true;
    this.structure = structure;
    if (++this.cycleTicks === s.config.ticksPerWeek) {
      const cycle: Cycle = { visits: this.cycleVisits, outings: this.cycleOutings, destinations: this.cycleDestinations.slice(), health: this.venues.map((v) => v.healthAfter), structure, changed: this.cycleChanged };
      const prev = this.previous;
      // Two consecutive whole-cycle comparisons (at least three cycles). Activity may vary by
      // 10% (one outing floor), health by 0.05; cohort destination shares must have total
      // variation <= 0.10. No structural changes in either cycle. Quiet cohorts cannot settle,
      // and a relevant upcoming or active event must resolve before comparisons can qualify.
      const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.max(a, b) * 0.1);
      let destinationDistance = 0;
      if (prev && prev.outings > 0 && cycle.outings > 0) {
        for (let v = 0; v < cycle.destinations.length; v++) destinationDistance += Math.abs(cycle.destinations[v] / cycle.outings - prev.destinations[v] / prev.outings) / 2;
      }
      const stable = prev && !this.relevantEventUnresolved(s) && !prev.changed && !cycle.changed && prev.structure === cycle.structure && this.spec.agentSlots.length > 0 && cycle.outings > 0 && prev.outings > 0 && near(cycle.visits, prev.visits) && near(cycle.outings, prev.outings) && destinationDistance <= 0.1 && cycle.health.every((h, i) => Math.abs(h - prev.health[i]) <= 0.05);
      this.stableComparisons = stable ? this.stableComparisons + 1 : 0;
      this.settled = this.stableComparisons >= 2;
      this.previous = cycle;
      this.cycleTicks = this.cycleVisits = this.cycleOutings = 0;
      this.cycleDestinations.fill(0);
      this.cycleChanged = false;
    }
    return this.completion(s);
  }

  report(s: SimState, reason: CaseReport["reason"]): CaseReport {
    const venues = this.venues.map((v) => ({
      venue: v.venue, entity: v.entity, cell: v.cell, visits: v.visits,
      healthBefore: v.healthBefore, healthAfter: v.healthAfter,
      openBefore: v.openBefore, openAfter: v.openAfter,
    }));
    return { id: this.spec.id, startTick: this.spec.startTick, endTick: s.tick, reason, observedTicks: this.observedTicks, visits: this.visits, uniqueVisitors: this.uniqueVisitors, cohortOutings: this.cohortOutings, venues, settledHeuristic: reason === "settled" };
  }
}
