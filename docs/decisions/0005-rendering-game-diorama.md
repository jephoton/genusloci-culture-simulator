# 0005 — Rendering: Three.js game diorama with real streets (replaces deck.gl + MapLibre)

- **Status:** Accepted (2026-10-09)
- **Decision:**
  - Render the city as a stylised night diorama with React Three Fiber, using post-processing (bloom, vignette, and custom shockwave/fisheye effects).
  - Streets, water and parks come from a `geo` section in the World file. That section is real OpenStreetMap geometry in Plan 4, and synthetic in the fixture until then.
  - Buildings and landmarks are procedural and instanced.
- **Alternatives considered:**
  - MapLibre basemap + deck.gl layers: real map tiles, but it feels like a data visualisation, and custom screen-space effects are awkward.
  - A pure diorama without real geometry: loses geographic credibility.
- **Rationale:**
  - The user wants it to look and feel like a game, with impactful animations (e.g. a fisheye shockwave when a venue opens). That needs full control of the scene and post-processing.
  - Real street geometry keeps the city recognisable for the impact pitch.
- **Consequences:**
  - The World schema gains an optional `geo` section and a venue `kind`.
  - Plan 4 must fetch and simplify OSM geometry, with attribution.
  - There is no map-tile dependency or key.
  - Rendering is verified visually in the browser, with only the pure layout and geometry code unit-tested.
