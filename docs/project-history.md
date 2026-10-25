# Commit history over the milestone roadmap

<!-- generated: retrospective from Git, not a dated implementation schedule -->

Scope: commits reachable from `17aacc6`, the reviewed HEAD before the 23 October restoration/alignment work. Dates below are recorded historical author dates in Singapore time. They are not milestone estimates, working hours or evidence of continuous work. Milestone documents sometimes have later filename dates than their implementation commits.

First commit: [`0c4020f`](https://github.com/jephoton/genusloci-culture-simulator/commit/0c4020f), 9 October 2026, 10:50:39 +08. As of 23 October the project spans about 14 elapsed calendar days. This baseline contains 290 reachable commits, including documentation and fixes.

## Roadmap overlay

| Original milestone | Observed implementation window | Representative commit evidence | Current interpretation |
| --- | --- | --- | --- |
| M1 — scaffold and simulation core | 9 Oct | `7a2e41f` scaffold; `3f6e396` deterministic loop; `9053cb0` completion | Engine foundation completed. |
| M2 — simulation ecology | 9 Oct | `5dbb3da` scene lineages; `8d3d04f` rewind/fork; `355be10` worker; `34f396c` completion | Ecology, interventions and reproducible state completed. |
| M5a — playable city | 9 Oct | `670a483` canvas/crowds; `7149613` playable UI; `4286598` completion | Visual layer arrived before Qloo integration, using fixtures. |
| M4a — OSM streets | 9 Oct | `31aa07a` OSM parser; `f077d18` London; `e94fc14` completion | Real geography was available before real cultural inputs. |
| M5b-1 — effects/animation | 9 Oct | `c3dc657` effects director; `ef5dc6d` waves/shake; `4c30bc7` landmarks/beacons | Broad visual effects implemented; some are now suppressed for focused cases. |
| M5b-1b — legibility | 9–10 Oct; completion recorded 13 Oct | `2b53cc7` street walking; `fd11136` focus/legend; `921b74e` hotspots; `0fbde93` status | Spatial legibility and focus matured. Placeholder buildings were later removed. |
| M5c — artist location scouting | 10 Oct | `6ef416e` demand/forked comparisons; `201658e` scout UI; `45eb779` completion | Original alternative-location tool. It was retained, later hidden, and is the foundation of the restored comparison flow. |
| M5d — daily cadence/true pause/venue colour | 10 Oct | `9ce130e` daily ticks; `4725c9e` pausable clock; `6b0b6a7` venue identity colour | Cadence stays internal; current UI uses checkpoints/manual controls. |
| M3 — Qloo spike/client | 13–14 Oct | `8266223` findings; `1faa973` transport; `6e390db` client; `e6e8c18` completion | Qloo cultural grounding infrastructure completed after the playable fixture city. |
| M4 — Qloo world builder | 14 Oct | `46ba6d6` assembly; `f8c243b` gathering; `da822fa` heatmaps; `2f33420` completion | Real Qloo city inputs replace synthetic cultural fixtures. |
| M6 — agent guide/interviews/naming | 14 Oct | `7da0a39` agent route; `f1437c8` tool UI; `a134f64` interviews; `3f80791` completion | Agent integration completed; current UI emphasizes experiment chat, with legacy features retained in code. |
| M7 — initial public ship | 14 Oct onward | `34f07f5` world storage; `cbaa4f9` intro; `5acc351` public deployment/materials | An initial release exists. Current branch publication and submission verification remain unfinished M7 work. |
| M5e — book for my venue | 14 Oct | `0bfd257` shared event engine; `2b45a49` host baseline accounting; `6041d78` UI; `9a7250b` completion | Extended M5c into host/act comparisons and outside-artist lookup. |
| M5b-2 — scene cards/tools/accessibility | 14 Oct | `5728f8a` cards; `4cd64fb` family tree; `c040799` reduced motion; `3b47ee1` completion | Implemented, with many controls subsequently hidden to narrow the UI. |

The milestones did not execute in numeric order: visual fixture work preceded Qloo, M5 had several parallel branches, and M7 shipping overlapped later feature work. A numbered roadmap is a dependency structure, not an accurate chronological log by itself.

## Work after the original milestone set

| Historical period | Roadmap relationship | Representative evidence |
| --- | --- | --- |
| 15–16 Oct | Deferred M4/M5/M6 hardening | `252e885` closure evidence/dated bookings; `da204bf` resumable builds; `d5f16a9` forecast identity; `3001b83` planning invalidation. |
| 21 Oct | M5/M7 product and visual refinement | `137b440` workspace submenus; `129a10a` miniature art; `515c0b7` road labels; `2147c75` artist-first shortlist/isolated impact; `f8a982a` overlay picker. |
| 22 Oct | Product reassessment and a new lab interaction model | `9ea09d6` problem reassessment; `6c80ea8` ALife spike synthesis; `311522f` chat-only entry. The latter hid the planner panels without exposing their comparison workflow in chat. |
| 22 Oct | Agent reliability and focused live cases | `0aa1df3` Gemini/Groq/fallback; `e93ffe4` cases/outcomes/history; `89d8197` recent visitors/replacement cases; `17aacc6` manual playback and no placeholder buildings. |
| 23 Oct — current uncommitted work at audit start | M5/M7 restoration and submission alignment | Restore a separate artist planner, retain chat history/manual playback, update source provenance and judging materials. See current state for final verification/commit. |

## Commit activity, not effort

| Date (Singapore) | Commits reachable from the baseline HEAD |
| --- | ---: |
| 9 Oct | 104 |
| 10 Oct | 30 |
| 13 Oct | 3 |
| 14 Oct | 103 |
| 15 Oct | 9 |
| 16 Oct | 5 |
| 21 Oct | 17 |
| 22 Oct | 19 |
| Total | 290 |

A dense commit day may reflect small atomic changes, agent assistance or documentation. Days without commits do not establish that no work happened. The defensible summary is: the foundation and first release were built during 9–14 October, hardening followed, and later work focused heavily on product direction, interface clarity and reliability.

## Remaining roadmap checkpoint

M7 remains open until the current experience is externally published, publicly rehearsed and submitted with matching source/description. The original engine milestones being marked Done does not mean every current user flow or the current public release is complete. Do not count an old sandbox deployment as publication of the current branch.

Sources: [original milestone roadmap](superpowers/milestones/2026-10-09-roadmap.md), Git history, [current state](current-state.md), [judging alignment](judging-alignment.md).
