# Focused city interface implementation plan

> **For agentic workers:** Use executing-plans to implement this plan task-by-task in this session.

**Goal:** Make venue booking the obvious first task, progressively reveal secondary tools, and give key cultural venues more recognizable architecture.

**Architecture:** Keep the existing simulation and booking APIs. Replace always-visible sidebars with one shared drawer state on desktop and mobile. Native disclosure elements contain secondary metrics and tool groups. A read-only capability response reports whether the existing server has an LLM configured, without exposing credentials or making provider requests.

**Tech Stack:** Next.js 16, React 19, React Three Fiber, Vitest.

## Approved direction

The user approved the venue-owner story, clearer workflow, and a bounded architectural pass, and specifically requested submenus to reduce visible buttons, numbers and explanatory text. Do not add dining/fashion features. Do not invent a working co-pilot when no provider key exists. No key acquisition or external account changes are authorized or necessary.

## Tasks

- [ ] Add regression coverage for drawer transitions, venue discovery and the missing-provider response. Run the new tests and confirm their initial failure.
- [ ] Implement `src/ui/panels.ts` as the shared navigation transition policy. Switching sections dismisses transient selection and safely exits planning/scouting; closing a placement drawer preserves the explicit map task until Cancel/Escape.
- [ ] Add `src/ui/VenueDirectory.tsx`: searchable real venues, inspection callback, event calendar submenu. Introduce it through `src/ui/GameShell.tsx` with one drawer at a time and explicit Close/Back controls. Preserve calendar cancellation, scouting, scene inspection and booking.
- [ ] Simplify `Hud.tsx`, `TimelineBar.tsx`, `Toolbar.tsx`, `VenuePanel.tsx` and `Intro.tsx`: city metrics, playback options, event tools, city interventions and advanced venue operations go into labeled disclosures. Keep the main booking action visible when a venue is selected.
- [ ] Add a GET capability response to the existing co-pilot route, with a client availability hook; explain unconfigured AI in its drawer and remove unavailable interview entry points. Disable background naming until configuration is known. Test configured/unconfigured behavior without network provider calls.
- [ ] Refine `Landmarks.tsx` for club, bar, cafe and music venue with street-facing doors, windows, roofs, awnings and marquees. Preserve footprint bounds, scene/state colours, closure effects and shared materials. Keep scenery instanced.
- [ ] Run targeted tests, full tests, lint and production build. Rehearse desktop/mobile drawer navigation, venue selection/comparison, placement cancel, AI-offline state and Escape behavior in the browser. Inspect screenshots and fix overlaps.
- [ ] Update current-state, runbook and walkthrough with the actual navigation, key requirements and verified limitations. Commit logical changes separately; do not merge/push without a new request.

## Verification boundaries

No live Qloo world rebuild or paid provider call is needed. A configured key is not proof that a provider will accept requests: capability means configuration only. Browser comparisons can use artists already present in the World. Measure readability at overview and close range; more model detail alone is not success.
