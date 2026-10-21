# Stylized miniature city implementation plan

**Goal:** Make the Townscaper/Tiny Glade-inspired art direction visibly apparent from the default overview, rather than adding details to generic dark boxes.

**Approved context:** The user requested a stronger stylized treatment after finding the first asset pass too subtle. Continue the existing miniature-city-at-night direction. Keep the focused venue-owner flow and simulation behavior.

**Design:** Background buildings become short painted townhouses with prominent pitched roofs and large sparse windows. Venues have exaggerated silhouettes, contrasting roofs, pastel masonry and chunky architectural framing. Lighting shifts to a readable blue-hour miniature, with warm windows and softer bloom. Residents remain scene-coloured markers but stop overwhelming architecture with white glare. Shapes remain original procedural assets; references inform proportions and material treatment, not copied game assets.

- [x] Add geometry regressions for roof footprint/normal validity and deterministic, footprint-aware building proportions. Confirm failing tests, then implement shared style geometry/helpers. Also walk the actual model trees and check all venue footprint radii.
- [x] Replace the background's single repeated tower silhouette with instanced body/roof meshes, low-rise proportions and a painted facade/window shader. Preserve building placement and keep draw calls bounded independently of building count.
- [x] Rework every venue type with readable roof forms and distinctive silhouettes, retaining footprints, ghost transparency, selection, health and scene signals. Exaggerate shape first; small decoration is secondary.
- [x] Tune blue-hour lighting, terrain/street palette, window glare and crowd glow to support model readability. Preserve map interactions and scene highlighting.
- [x] Restart the server after the user's key change, verify configuration without viewing secrets, and request a live co-pilot answer through the UI. A multi-step request hit Groq's token-per-minute limit after reading the city; a short follow-up answered successfully. Naming also worked. Provider 429s now produce a clear public message with a tested fallback for unexpected errors.
- [x] Inspect the city from overview and closer zoom, including pause/play, scene focus, direct map inspection, directory flight, and a roofed placement ghost with Escape cancellation. Compare visual evidence against the prior screenshot. Fix review findings (occluded cafe sign; focus dimming of painted materials), run tests/lint/build, and maintain handoff docs.

**Boundaries:** No world rebuild, new taste domains, provider switching, secret printing, merge or push. Key validity/model access is confirmed only by an actual answer. Geometry stays inside the existing footprint clearance; roofs add height only. More distinctive models must remain visible without opening a model gallery.

Verification: 461 tests across 94 files, lint and production build passed. No performance benchmark was run; the background remains two instanced draw meshes, but venue meshes are more detailed. Provider rate limits remain a material constraint on longer agent exchanges.
