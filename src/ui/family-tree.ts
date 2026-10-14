/** One row of the scene family tree: a scene (live, or a faded ancestor of a live one) at its depth. */
export type FamilyRow = { id: number; depth: number; live: boolean; size: number };

/**
 * The family tree of the live scenes: every live scene under its ancestors (faded ancestors included,
 * so splits read as branches), biggest families first, children biggest first.
 */
export function familyRows(parents: ArrayLike<number>, live: readonly { id: number; size: number }[]): FamilyRow[] {
  const sizeOf = new Map(live.map((s) => [s.id, s.size]));
  const parentOf = (id: number) => (id >= 0 && id < parents.length ? parents[id] : -1);
  // Every lineage on a path from a live scene up to its root.
  const keep = new Set<number>();
  for (const s of live) {
    for (let id = s.id, guard = 0; id >= 0 && !keep.has(id) && guard < 10_000; id = parentOf(id), guard++) keep.add(id);
  }
  const children = new Map<number, number[]>();
  const roots: number[] = [];
  for (const id of keep) {
    const p = parentOf(id);
    if (p >= 0 && keep.has(p)) children.set(p, [...(children.get(p) ?? []), id]);
    else roots.push(id);
  }
  const total = new Map<number, number>();
  const familySize = (id: number): number => {
    const known = total.get(id);
    if (known !== undefined) return known;
    const t = (sizeOf.get(id) ?? 0) + (children.get(id) ?? []).reduce((acc, c) => acc + familySize(c), 0);
    total.set(id, t);
    return t;
  };
  const order = (ids: number[]) => [...ids].sort((a, b) => familySize(b) - familySize(a) || a - b);
  const rows: FamilyRow[] = [];
  const visit = (id: number, depth: number) => {
    rows.push({ id, depth, live: sizeOf.has(id), size: sizeOf.get(id) ?? 0 });
    for (const c of order(children.get(id) ?? [])) visit(c, depth + 1);
  };
  for (const r of order(roots)) visit(r, 0);
  return rows;
}
