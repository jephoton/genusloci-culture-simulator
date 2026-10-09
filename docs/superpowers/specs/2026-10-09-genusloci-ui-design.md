# Genus Loci — UI and Rendering Design (addendum)

- **Status:** Approved in brainstorming, 2026-10-09.
- **Supersedes:** the rendering-stack choices in the main spec (§4, §10: deck.gl + MapLibre), via decision 0005.
- **Main spec:** [2026-10-09-genusloci-design.md](2026-10-09-genusloci-design.md)

## Direction: "night observatory" + "naturalist's field guide"

The city is a playable, game-like night diorama. Scenes glow as coloured crowds, and the interface catalogues them like species.

- **Observatory (the canvas):**
  - a dark city lit by window lights and neon signs;
  - bloom and vignette;
  - crowds of glowing agents streaming through the streets.
- **Field guide (the HTML overlay):**
  - scenes get mock-Latin binomial names (e.g. *Postpunk shoreditchii*);
  - specimen-card inspectors;
  - a botanical family tree (phylogeny);
  - serif type for "the guide's voice".

## Rendering

- **Stack:** Three.js via React Three Fiber (`@react-three/fiber`, `@react-three/drei`), with post-processing from `postprocessing` / `@react-three/postprocessing`. The canvas is client-only (`next/dynamic` with `ssr: false` inside a client component).
- **Real streets:**
  - The World carries an optional `geo` section: roads (major/minor polylines), water and parks (polygons), and bounds, all in local metres relative to the city origin.
  - In Plan 4 it comes from OpenStreetMap (ODbL attribution required). Until then the synthetic fixture generates a street grid, a river and parks.
- **Scale:** 1 scene unit = 10 m.
- **Buildings:** procedural, instanced boxes scattered across the city.
  - Density and height follow the population density of the nearest cell.
  - They avoid roads, water, parks and landmark pads.
  - A window-light shader gives per-floor windows, flicker, and a lit fraction per building.
- **Landmarks:** venues are distinct low-poly shapes per venue `kind` (club, bar, café, restaurant, gallery, music venue, shop, stadium, other). Each sits on one of six pads around its cell centre and has a neon sign:
  - its colour is the dominant scene among tonight's visitors;
  - its brightness is the venue's health;
  - a closed venue sinks and goes dark.
- **Crowds:** one instanced glowing figure per agent.
  - Each tick it moves from where it was to its target (its venue pad, or home), eased over the tick.
  - Its colour is its scene's hue.
- **Scene colours:** a root scene's hue is set by the golden angle on its lineage id; a child scene's hue is offset from its parent's (±24°, ±32°, …), so related scenes look related.

## Effects director (Plan 5b)

The effects director compares consecutive frames and fires effects:

| Change | Effect |
|---|---|
| Venue opens | Screen-space fisheye **shockwave** from the venue; the landmark rises with an overshoot; bloom flash; slight camera shake; nearby crowds ripple outward |
| Venue closes | Implosion ripple; the building sinks with dust; the sign flickers out; regulars scatter |
| Event | Light-pillar beacon, pulsing ring, crowds converging from across the city |
| Scene birth / split | Colour wave through the members; on a split, the child hue peels off the parent's; a specimen card slides in |
| Taste mutation | A tiny sparkle on the agent as its colour shifts |
| Migration | A trail of newcomers arriving from the map edge |
| Rent pressure | Heat-haze shimmer and a warm tint over the district |

## Interaction

- **Camera:** map-style pan, rotate and zoom (drei `MapControls`), limited polar angle, damping.
- **God toolbar:**
  - Plan 5a: select, open venue (choose a place, then click the map), schedule event (choose an artist, then click the map).
  - Plan 5b: close venue (from the inspector), migrate, rent pressure.
- **Timeline:** play/pause, speed (1/2/4/8 weeks per second), and scrub-to-rewind from the earliest retained tick to now.
- **HUD:** city, week, agents, venues open/closed/events, scenes, fidelity.
- **Inspector:**
  - Plan 5a: a venue panel (name, kind, open, health, visitors, close button).
  - Plan 5b: specimen cards for scenes, venues and agents.

## Simulation streaming

- **Commands:** the worker protocol gains `play {timeline, ticksPerSecond}`, `pause`, and `frame {timeline}`.
- **Pushed frames:** while playing, the worker advances one tick per interval and pushes a `{ kind: "frame" }` message with transferable typed arrays:
  - per agent: alive, home cell, attendance, scene lineage id;
  - lineage parents;
  - per venue, sliced to `nVenues`: entity, cell, open, health, attendance, expires;
  - tick and earliest tick;
  - a digest every 4th frame.
- **Snapshot retention** thins with age:
  - every 10 ticks for the last 100;
  - every 40 up to 400;
  - every 160 beyond that.

  Old rewinds therefore stay fast and memory stays bounded.

## Split

- **Plan 5a — playable city:** streaming, snapshot thinning, `geo` and venue `kind`, layout, diorama, crowds, camera, basic toolbar, timeline, HUD and venue panel.
- **Plan 5b — juice and field guide:** effects director and every effect above, specimen cards, phylogeny, Latin names, the remaining tools, typography and polish.
