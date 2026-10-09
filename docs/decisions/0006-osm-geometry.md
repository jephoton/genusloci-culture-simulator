# 0006 — City geometry: prebuilt OpenStreetMap files in public/geo (ODbL)

- **Status:** Accepted (2026-10-10)
- **Decision:** A CLI (`pnpm build:geo <city>`) fetches roads, water and parks once per city from the Overpass API, then simplifies, clips and reprojects them, and writes `public/geo/<city>.json`. The app loads that file at runtime.
- **Licensing:**
  - The files are ODbL, with a notice in `public/geo/README.md`.
  - The app shows "© OpenStreetMap contributors".
  - The code remains MIT.
- **Alternatives considered:**
  - Fetching Overpass on demand at runtime: slow, fragile under judging load, and against Overpass fair use.
  - Map tiles: rejected in decision 0005.
- **Rationale:** real, recognisable streets now, without a Qloo key; deterministic demos; no runtime dependency.
- **Consequences:**
  - Each prebuilt city adds a static JSON file (aim for ≤ about 3 MB).
  - Plan 4's on-demand city builds will reuse `parseOverpass` server-side and cache the result rather than commit it.
