# M5b-2 — Scene cards, family tree, newcomers and rent tools, accessibility

**Goal:**
- every god-game action is usable without the co-pilot;
- scenes are explorable on their own: what they like, where they live, where they came from.

Plain wording throughout (no "field guide" voice or Latin, by user preference).

## Scope

- **Toolbar: Bring in newcomers** (the `migrate` action).
  - Pick a scene, whose top tastes become the newcomers' tastes, and a group size of 100, 250 or 500.
  - Click the map; the newcomers settle in the cells within about 400 m.
  - Toast: "250 newcomers who like Grime Friend Groups' tastes moved into Lambeth".
- **Toolbar: Raise the rent** (the `rentPressure` action).
  - Pick +25%, +50% or +100%, then click the map; cells within about 400 m get pricier.
  - Toast: "Rents up 50% around Soho". Venues there now need bigger crowds to stay healthy.
- **Scene card** (right column, under the legend, while a scene is pinned):
  - name, size, and a size sparkline from the digests seen so far;
  - top tastes, split into artists and tags;
  - home neighbourhoods and venues tonight;
  - "split from" (parent) and "split into" (live children), clickable;
  - a Talk button.
- **Family tree:** a List / Family tree switch in the Scenes panel. The tree shows live scenes nested under their parents; faded ancestors appear by name if known, else as "an earlier scene".
- **Accessibility:**
  - `prefers-reduced-motion` turns off the shockwave, camera shake and fly-to animation (jumps instead);
  - visible focus rings on controls;
  - aria labels on new controls.

## Tasks

1. Pure helpers: cells within a radius of a point; newcomer genes from a scene; size history; family-tree rows. Tests.
2. Toolbar tools plus GameShell placement handlers (ghost/cursor reuse) and toasts.
3. Scene card.
4. Family tree view.
5. Reduced motion and focus rings.
6. Browser check, then docs.
