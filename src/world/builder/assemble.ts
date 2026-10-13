import type { QEntity, QHeatCell } from "@/qloo/schemas";
import { createRng } from "@/sim/rng";
import { KIND_CAPACITY, kindOf } from "@/world/builder/kinds";
import { gridCentres, streetDensity } from "@/world/grid";
import { fromLocalMetres, toLocalMetres } from "@/world/projection";
import type { Geo, VenueKind, World } from "@/world/schema";

// Pure: turns gathered Qloo data into a World. The only Qloo-calling code is gather.ts.

export type GatheredVenue = { entity: QEntity; queryKind: VenueKind };

export interface CityBundle {
  city: { slug: string; name: string; lat: number; lon: number; radiusM: number };
  geo: Geo;
  /** Venues from the per-kind queries; may repeat across queries. */
  venues: GatheredVenue[];
  /** Venue id → artists recommended for its crowd, best first. */
  artistsByVenue: Record<string, QEntity[]>;
  builtAt?: string;
}

export interface AssembleOptions {
  cellSizeM: number;
  /** Venues per cell (cells have 6 landmark pads; the rest are left for openings). */
  maxPerCell: number;
  maxVenues: number;
  /** Real places kept without a cell, for the niche logic to open. */
  maxReserve: number;
  maxPlaceTags: number;
  maxMusicTags: number;
  maxArtists: number;
  archetypes: number;
  /** Weekly visits all open venues hold together (matched to the demo's agents × outing rate). */
  capacityTotal: number;
  /** Gaussian σ (m) of the venue kernel that seeds each cell's archetype mix. */
  kernelM: number;
  /** Share of each cell spread evenly over archetypes. */
  mixing: number;
  seed: number;
}

export const ASSEMBLE_DEFAULTS: AssembleOptions = {
  cellSizeM: 300,
  maxPerCell: 4,
  maxVenues: 140,
  maxReserve: 60,
  maxPlaceTags: 120,
  maxMusicTags: 60,
  maxArtists: 200,
  archetypes: 8,
  capacityTotal: 1800,
  kernelM: 400,
  mixing: 0.15,
  seed: 7,
};

/** Place tag types that say something about taste (not payments, parking, accessibility…). */
const PLACE_TAG_TYPES = new Set([
  "urn:tag:ambience:qloo",
  "urn:tag:category:place",
  "urn:tag:interests:qloo",
  "urn:tag:customer_identity:qloo",
  "urn:tag:inclusivity:place",
  "urn:tag:activity_type:qloo",
  "urn:tag:decor:qloo",
  "urn:tag:culinary_style:qloo",
  "urn:tag:cuisine:qloo",
  "urn:tag:noise_level:qloo",
  "urn:tag:age_range:qloo",
  "urn:tag:time_of_day_fit:qloo",
]);
const MUSIC_TAG_TYPES = new Set(["urn:tag:genre:music", "urn:tag:subgenre:qloo", "urn:tag:style:qloo"]);

/** "What it is" tag types; a scene's name leads with one of these, then a vibe tag. */
const WHAT_TAG_TYPES = new Set(["urn:tag:category:place", "urn:tag:cuisine:qloo", "urn:tag:culinary_style:qloo"]);

/** Display name for a tag: Qloo's name, tidied (age ranges arrive as "25 29"). */
export function tagLabel(t: { id: string; name: string; type?: string }): string {
  if (tagType(t) === "urn:tag:age_range:qloo") {
    const m = /^(\d+)\s+(\d+)$/.exec(t.name.trim());
    return m ? `Ages ${m[1]}–${m[2]}` : `Ages ${t.name.trim()}`;
  }
  const n = t.name.trim();
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/** A tag's type: its declared type, else its URN minus the last segment. */
const tagType = (t: { id: string; type?: string }) => t.type ?? t.id.slice(0, t.id.lastIndexOf(":"));

/**
 * Per archetype, entity indices (best first) whose Qloo heatmaps to fetch:
 * - `seed`: the scene's most distinctive place tags; the first that has data seeds where the scene's
 *   residents live (`applySeedHeatmaps`).
 * - `check`: its artists, then its other tags, then its top venue; the first held out from seeding
 *   becomes the fidelity heatmap (`attachHeatmaps`), so the score isn't measured on seeding data.
 */
export type HeatmapPlan = { archetype: number; seed: number[]; check: number[] }[];

export interface Assembled {
  world: World;
  heatmapPlan: HeatmapPlan;
}

type Sparse = Map<number, number>;

function normalise(v: Sparse): Sparse {
  let n = 0;
  for (const x of v.values()) n += x * x;
  n = Math.sqrt(n);
  if (n > 0) for (const [k, x] of v) v.set(k, x / n);
  return v;
}

function dot(a: Sparse, b: Sparse): number {
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  let s = 0;
  for (const [k, x] of small) s += x * (big.get(k) ?? 0);
  return s;
}

/** Spherical k-means with k-means++ seeding (seeded, so deterministic). Returns an assignment per vector. */
export function sphericalKMeans(vectors: Sparse[], k: number, seed: number, iters = 25): number[] {
  const n = vectors.length;
  k = Math.max(1, Math.min(k, n));
  const rng = createRng(seed);
  const centroids: Sparse[] = [new Map(vectors[rng.int(n)])];
  while (centroids.length < k) {
    const d = vectors.map((v) => Math.max(0, 1 - Math.max(...centroids.map((c) => dot(v, c)))) ** 2);
    const total = d.reduce((a, x) => a + x, 0);
    let r = rng.next() * total;
    let pick = 0;
    for (; pick < n - 1; pick++) {
      r -= d[pick];
      if (r < 0) break;
    }
    if (total === 0) pick = centroids.length % n;
    centroids.push(new Map(vectors[pick]));
  }
  let assign = new Array<number>(n).fill(-1);
  for (let it = 0; it < iters; it++) {
    const next = vectors.map((v) => {
      let best = 0;
      let bestSim = -Infinity;
      centroids.forEach((c, j) => {
        const s = dot(v, c);
        if (s > bestSim) {
          bestSim = s;
          best = j;
        }
      });
      return best;
    });
    const changed = next.some((a, i) => a !== assign[i]);
    assign = next;
    for (let j = 0; j < k; j++) {
      const c: Sparse = new Map();
      vectors.forEach((v, i) => {
        if (assign[i] !== j) return;
        for (const [key, x] of v) c.set(key, (c.get(key) ?? 0) + x);
      });
      if (c.size > 0) centroids[j] = normalise(c);
    }
    if (!changed) break;
  }
  return assign;
}

/** Round-robin over kinds (each sorted by popularity), so no single kind crowds out the others. */
function interleaveByKind<T extends { kind: VenueKind; popularity: number }>(items: T[]): T[] {
  const groups = new Map<VenueKind, T[]>();
  for (const it of items) groups.set(it.kind, [...(groups.get(it.kind) ?? []), it]);
  const lists = [...groups.values()].map((l) => l.sort((a, b) => b.popularity - a.popularity));
  const out: T[] = [];
  for (let i = 0; out.length < items.length; i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

export function assembleWorld(bundle: CityBundle, options: Partial<AssembleOptions> = {}): Assembled {
  const o = { ...ASSEMBLE_DEFAULTS, ...options };
  const { city, geo } = bundle;
  const b = geo.bounds;

  // Cells.
  const centres = gridCentres(geo, o.cellSizeM);
  if (centres.length === 0) throw new Error("assembleWorld: no land cells");
  const density = streetDensity(geo, centres, o.cellSizeM);
  const nearestCell = (x: number, y: number) => {
    let best = 0;
    let bestD = Infinity;
    centres.forEach(([cx, cy], i) => {
      const d = (cx - x) ** 2 + (cy - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };

  // Venues: dedupe, keep located, open, in-bounds places; then pick fairly across kinds.
  const seen = new Set<string>();
  const candidates = bundle.venues.flatMap(({ entity, queryKind }) => {
    if (seen.has(entity.id) || !entity.location || entity.place?.isClosed) return [];
    seen.add(entity.id);
    const { x, y } = toLocalMetres(entity.location, city);
    if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) return [];
    const kind = kindOf(
      entity.tags.map((t) => t.id),
      queryKind,
    );
    return [{ entity, kind, x, y, cell: nearestCell(x, y), popularity: entity.popularity ?? 0 }];
  });
  const perCell = new Map<number, number>();
  const placed: typeof candidates = [];
  const reserve: typeof candidates = [];
  for (const c of interleaveByKind(candidates)) {
    const used = perCell.get(c.cell) ?? 0;
    if (placed.length < o.maxVenues && used < o.maxPerCell) {
      placed.push(c);
      perCell.set(c.cell, used + 1);
    } else if (reserve.length < o.maxReserve) {
      reserve.push(c);
    }
  }
  const venues = [...placed, ...reserve];
  if (placed.length === 0) throw new Error("assembleWorld: no venues inside the city bounds");

  // Place tags: taste-bearing types shared by 3+ venues but not by most of them.
  const df = new Map<string, { name: string; n: number }>();
  for (const v of venues) {
    for (const t of new Set(v.entity.tags.filter((t) => PLACE_TAG_TYPES.has(tagType(t))).map((t) => t.id))) {
      const found = v.entity.tags.find((x) => x.id === t);
      df.set(t, { name: found ? tagLabel(found) : t, n: (df.get(t)?.n ?? 0) + 1 });
    }
  }
  const nV = venues.length;
  const placeTags = [...df]
    .filter(([, d]) => d.n >= Math.min(3, nV) && d.n <= Math.max(1, 0.7 * nV))
    .sort((a, b2) => b2[1].n - a[1].n || (a[0] < b2[0] ? -1 : 1))
    .slice(0, o.maxPlaceTags);

  // Artists: recommended for kept venues, most-recommended first.
  const artistInfo = new Map<string, { entity: QEntity; count: number; best: number }>();
  for (const v of venues) {
    (bundle.artistsByVenue[v.entity.id] ?? []).forEach((a, r) => {
      const cur = artistInfo.get(a.id);
      artistInfo.set(a.id, { entity: a, count: (cur?.count ?? 0) + 1, best: Math.min(cur?.best ?? r, r) });
    });
  }
  const artists = [...artistInfo.values()]
    .sort((a, b2) => b2.count - a.count || a.best - b2.best || (a.entity.id < b2.entity.id ? -1 : 1))
    .slice(0, o.maxArtists);

  // Music tags shared by 2+ kept artists.
  const mdf = new Map<string, { name: string; n: number }>();
  for (const a of artists) {
    for (const t of a.entity.tags) {
      if (!MUSIC_TAG_TYPES.has(tagType(t))) continue;
      mdf.set(t.id, { name: tagLabel(t), n: (mdf.get(t.id)?.n ?? 0) + 1 });
    }
  }
  const musicTags = [...mdf]
    .filter(([, d]) => d.n >= 2)
    .sort((a, b2) => b2[1].n - a[1].n || (a[0] < b2[0] ? -1 : 1))
    .slice(0, o.maxMusicTags);

  // Entity order: placed venues, reserve venues, place tags, music tags, artists.
  const index = new Map<string, number>();
  const entities: World["entities"] = [];
  const add = (e: World["entities"][number]) => {
    if (index.has(e.id)) return;
    index.set(e.id, entities.length);
    entities.push(e);
  };
  const placeTagIds = new Set(placeTags.map(([id]) => id));
  const musicTagIds = new Set(musicTags.map(([id]) => id));

  const capWeight = (v: (typeof venues)[number]) => KIND_CAPACITY[v.kind] * (0.6 + 0.4 * v.popularity);
  const capScale = o.capacityTotal / placed.reduce((s, v) => s + capWeight(v), 0);
  venues.forEach((v, i) => {
    add({
      id: v.entity.id,
      name: v.entity.name,
      type: "place",
      tags: [...new Set(v.entity.tags.map((t) => t.id).filter((t) => placeTagIds.has(t)))],
      popularity: Math.min(1, Math.max(0, v.popularity)),
      ...(i < placed.length ? { cell: v.cell } : {}),
      capacity: Math.max(1, Math.round(capWeight(v) * capScale * 10) / 10),
      kind: v.kind,
    });
  });
  for (const [id, d] of placeTags) add({ id, name: d.name, type: "tag", tags: [], popularity: d.n / nV });
  for (const [id, d] of musicTags) add({ id, name: d.name, type: "tag", tags: [], popularity: d.n / Math.max(1, artists.length) });
  for (const a of artists) {
    add({
      id: a.entity.id,
      name: a.entity.name,
      type: "artist",
      tags: [...new Set(a.entity.tags.map((t) => t.id).filter((t) => musicTagIds.has(t)))],
      popularity: Math.min(1, Math.max(0, a.entity.popularity ?? 0)),
    });
  }
  const idx = (id: string) => index.get(id);

  // Edges, symmetric, keeping the strongest weight per pair.
  const edgeMap = new Map<string, number>();
  const link = (a: number | undefined, c: number | undefined, w: number) => {
    if (a === undefined || c === undefined || a === c || !(w > 0)) return;
    const wt = Math.min(1, w);
    for (const key of [`${a},${c}`, `${c},${a}`]) edgeMap.set(key, Math.max(edgeMap.get(key) ?? 0, wt));
  };
  const maxIdf = Math.log(Math.max(2, nV));
  const idf = (t: string) => Math.log(nV / (df.get(t)?.n ?? nV)) / maxIdf;

  const vectors: Sparse[] = venues.map((v) => {
    const vi = idx(v.entity.id) as number;
    const vec: Sparse = new Map();
    for (const t of entities[vi].tags) {
      const w = 0.3 + 0.7 * idf(t);
      link(vi, idx(t), w);
      vec.set(idx(t) as number, w);
    }
    const recs = bundle.artistsByVenue[v.entity.id] ?? [];
    recs.forEach((a, r) => {
      const ai = idx(a.id);
      if (ai === undefined) return;
      const w = 0.9 - (0.5 * r) / Math.max(1, recs.length);
      link(vi, ai, w);
      vec.set(ai, 0.5 * w);
    });
    // Artists co-recommended for the same crowd are related.
    const kept = recs.map((a) => idx(a.id)).filter((x): x is number => x !== undefined);
    for (let i = 0; i < kept.length; i++) for (let j = i + 1; j < kept.length; j++) link(kept[i], kept[j], 0.3);
    return normalise(vec);
  });
  for (const a of artists) for (const t of entities[idx(a.entity.id) as number].tags) link(idx(a.entity.id), idx(t), 0.6);

  // Venue–venue: each venue's 4 most similar by taste vector.
  vectors.forEach((v, i) => {
    vectors
      .map((u, j) => ({ j, s: i === j ? -1 : dot(v, u) }))
      .filter((x) => x.s > 0.2)
      .sort((p, q) => q.s - p.s || p.j - q.j)
      .slice(0, 4)
      .forEach(({ j, s }) => link(idx(venues[i].entity.id), idx(venues[j].entity.id), s));
  });

  // Tag–tag: each place tag's 4 strongest co-occurring tags (cosine over venues), for drift.
  const tagVenues = new Map<number, Set<number>>();
  venues.forEach((v, vi) => {
    for (const t of entities[idx(v.entity.id) as number].tags) {
      const ti = idx(t) as number;
      if (!tagVenues.has(ti)) tagVenues.set(ti, new Set());
      tagVenues.get(ti)!.add(vi);
    }
  });
  const tagList = [...tagVenues.keys()];
  for (const t of tagList) {
    const A = tagVenues.get(t)!;
    tagList
      .map((u) => {
        if (u === t) return { u, s: -1 };
        const B = tagVenues.get(u)!;
        let co = 0;
        for (const x of A) if (B.has(x)) co++;
        return { u, s: co / Math.sqrt(A.size * B.size) };
      })
      .filter((x) => x.s > 0.2)
      .sort((p, q) => q.s - p.s || p.u - q.u)
      .slice(0, 4)
      .forEach(({ u, s }) => link(t, u, 0.8 * s));
  }

  const edges: World["edges"] = [...edgeMap].map(([key, weight]) => {
    const [source, target] = key.split(",").map(Number);
    return { source, target, weight };
  });

  // Archetypes: taste clusters of venues.
  const assign = sphericalKMeans(vectors, o.archetypes, o.seed);
  const clusters = [...new Set(assign)].sort((p, q) => p - q);
  const globalMean: Sparse = new Map();
  for (const v of vectors) for (const [k, x] of v) globalMean.set(k, (globalMean.get(k) ?? 0) + x / vectors.length);

  const archetypes: World["archetypes"] = [];
  const heatmapPlan: HeatmapPlan = [];
  const clusterOfArchetype: number[] = [];
  for (const c of clusters) {
    const members = venues.map((_, i) => i).filter((i) => assign[i] === c);
    const centroid: Sparse = new Map();
    for (const i of members) for (const [k, x] of vectors[i]) centroid.set(k, (centroid.get(k) ?? 0) + x / members.length);
    const tagGenes = [...centroid]
      .filter(([k]) => entities[k].type === "tag")
      .sort((p, q) => q[1] - p[1] || p[0] - q[0])
      .slice(0, 10);
    const artistScore = new Map<number, number>();
    for (const i of members) {
      const recs = bundle.artistsByVenue[venues[i].entity.id] ?? [];
      recs.forEach((a, r) => {
        const ai = idx(a.id);
        if (ai !== undefined) artistScore.set(ai, (artistScore.get(ai) ?? 0) + 1 - r / Math.max(1, recs.length));
      });
    }
    const artistGenes = [...artistScore].sort((p, q) => q[1] - p[1] || p[0] - q[0]).slice(0, 8);
    const top = (list: [number, number][]) => Math.max(1e-9, ...list.map(([, w]) => w));
    const genes = [
      ...tagGenes.map(([entity, w]) => ({ entity, weight: 0.4 + 0.6 * (w / top(tagGenes)) })),
      ...artistGenes.map(([entity, w]) => ({ entity, weight: 0.4 + 0.6 * (w / top(artistGenes)) })),
    ];
    if (genes.length === 0) continue;
    // Name: the most distinctive "what" tag, then the most distinctive other tag (by lift over the city).
    const lifts = tagGenes
      .map(([k, w]) => ({ k, lift: w / ((globalMean.get(k) ?? 0) + 0.05), what: WHAT_TAG_TYPES.has(tagType({ id: entities[k].id })) }))
      .sort((p, q) => q.lift - p.lift || p.k - q.k);
    const what = lifts.find((x) => x.what);
    const vibe = lifts.find((x) => !x.what && entities[x.k].name.toLowerCase() !== (what ? entities[what.k].name.toLowerCase() : ""));
    const distinctive = [what, vibe].filter((x) => x !== undefined).map((x) => entities[x.k].name);
    const a = archetypes.length;
    archetypes.push({ id: `arch:${city.slug}:${a}`, name: distinctive.join(" · ") || `Scene ${a + 1}`, genes });
    clusterOfArchetype.push(c);
    const topVenue = members
      .filter((i) => i < placed.length)
      .sort((p, q) => venues[q].popularity - venues[p].popularity || p - q)[0];
    const placeTagLifts = lifts.filter((x) => placeTagIds.has(entities[x.k].id)).slice(0, 3).map((x) => x.k);
    heatmapPlan.push({
      archetype: a,
      // Artists back up the tags, so every scene gets a Qloo seed; checks then use what's left.
      seed: [...placeTagLifts, ...artistGenes.slice(0, 3).map(([e]) => e)],
      check: [
        ...artistGenes.slice(0, 3).map(([e]) => e),
        ...placeTagLifts,
        ...(topVenue !== undefined ? [idx(venues[topVenue].entity.id) as number] : []),
      ],
    });
  }
  if (archetypes.length === 0) throw new Error("assembleWorld: no archetypes (venues had no taste data)");

  // Cells: archetype mix from a Gaussian kernel over each archetype's venues.
  const twoSigma2 = 2 * o.kernelM ** 2;
  const cells: World["cells"] = centres.map(([x, y], ci) => {
    const raw = clusterOfArchetype.map((c) => {
      let s = 0;
      venues.forEach((v, i) => {
        if (assign[i] === c) s += (0.5 + 0.5 * v.popularity) * Math.exp(-((v.x - x) ** 2 + (v.y - y) ** 2) / twoSigma2);
      });
      return s;
    });
    const total = raw.reduce((p, q) => p + q, 0);
    const A = raw.length;
    const mix = raw.map((w) => (total > 0 ? (1 - o.mixing) * (w / total) + o.mixing / A : 1 / A));
    const { lat, lon } = fromLocalMetres({ x, y }, city);
    return {
      geohash: `c${ci}`,
      lat,
      lon,
      density: density[ci],
      archetypes: mix.map((weight, archetype) => ({ archetype, weight })),
    };
  });

  return {
    world: {
      version: 1,
      city: { name: city.name, lat: city.lat, lon: city.lon },
      entities,
      edges,
      cells,
      archetypes,
      heatmaps: [],
      geo,
      meta: { source: "qloo", builtAt: bundle.builtAt, attribution: "Taste data: Qloo" },
    },
    heatmapPlan,
  };
}

/** Seed heatmap rank exponent: higher concentrates a scene's residents where Qloo's signal is strongest. */
export const SEED_SHARPNESS = 3;

/**
 * Re-seeds each cell's archetype mix from Qloo heatmaps: an archetype's weight in a cell is its seed
 * heatmap's rank there (0–1) to the power `sharpness`, normalised over archetypes and blended with
 * `mixing` of the uniform mix. An archetype without a seed uses the rank of its current (venue-kernel)
 * share instead, so every archetype is on the same scale.
 */
export function applySeedHeatmaps(
  world: World,
  seeds: { archetype: number; cells: QHeatCell[] }[],
  options: { cellSizeM?: number; sharpness?: number; mixing?: number } = {},
): World {
  const { cellSizeM = ASSEMBLE_DEFAULTS.cellSizeM, sharpness = SEED_SHARPNESS, mixing = ASSEMBLE_DEFAULTS.mixing } = options;
  const nC = world.cells.length;
  const A = world.archetypes.length;
  const sharpRanks = (values: number[]) => {
    const order = values.map((v, c) => [v, c] as const).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const rank = new Array<number>(nC);
    order.forEach(([, c], i) => (rank[c] = ((i + 1) / nC) ** sharpness));
    return rank;
  };
  const signal: (number[] | null)[] = Array.from({ length: A }, () => null);
  for (const { archetype, cells } of seeds) {
    const values = attachHeatmaps(world, [{ entity: 0, cells }], cellSizeM).heatmaps[0]?.values;
    if (values) signal[archetype] = sharpRanks(values);
  }
  if (signal.every((s) => s === null)) return world;
  for (let a = 0; a < A; a++) signal[a] ??= sharpRanks(world.cells.map((c) => c.archetypes[a].weight));
  const cells = world.cells.map((cell, c) => {
    const raw = Array.from({ length: A }, (_, a) => signal[a]![c]);
    const total = raw.reduce((p, q) => p + q, 0);
    return {
      ...cell,
      archetypes: raw.map((w, archetype) => ({ archetype, weight: total > 0 ? (1 - mixing) * (w / total) + mixing / A : 1 / A })),
    };
  });
  return { ...world, cells };
}

/**
 * Adds one heatmap per fetched result: each Qloo geohash cell's affinity is averaged into our nearest
 * cell (within one cell size); cells with no data get 0.
 */
export function attachHeatmaps(
  world: World,
  results: { entity: number; cells: QHeatCell[] }[],
  cellSizeM = ASSEMBLE_DEFAULTS.cellSizeM,
): World {
  const origin = world.city;
  const local = world.cells.map((c) => toLocalMetres(c, origin));
  const heatmaps = results
    .filter((r) => r.cells.length > 0)
    .map(({ entity, cells }) => {
      const sum = new Float64Array(world.cells.length);
      const n = new Float64Array(world.cells.length);
      for (const h of cells) {
        const p = toLocalMetres(h, origin);
        let best = -1;
        let bestD = Infinity;
        local.forEach((q, i) => {
          const d = Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y));
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        });
        if (best >= 0 && bestD <= cellSizeM) {
          sum[best] += h.affinity;
          n[best]++;
        }
      }
      return { entity, values: Array.from(sum, (s, i) => (n[i] > 0 ? s / n[i] : 0)) };
    });
  return { ...world, heatmaps };
}
