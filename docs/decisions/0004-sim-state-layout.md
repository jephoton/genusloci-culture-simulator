# 0004 — Simulation state layout: per-state venue table and agent slots

- **Status:** Accepted (2026-10-09)
- **Decision:**
  - Venue tables (entity, cell, capacity, dense taste profile, health, expiry, reach) live in `SimState` with `venueReserve` spare slots. `nearbyVenues` is rebuilt whenever a venue opens or closes.
  - Agents occupy `nAgents + agentReserve` slots with an `alive` mask.
  - `CompiledWorld` keeps only the immutable taste graph, place list and geography.
- **Alternatives considered:**
  - Keeping venues in `CompiledWorld`: cannot open venues per timeline.
  - Growable arrays: reallocation breaks typed-array views and complicates cloning.
- **Rationale:** actions (open venue, event, migrate) and auto-opening need per-timeline venue and agent sets that clone, hash and rewind with the state. Fixed reserves keep every structure a flat typed array.
- **Consequences:** the reserves cap how many venues and migrants a timeline can add (validated by actions). Every loop over agents checks `alive`; every loop over venues runs to `nVenues`.
