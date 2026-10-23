# Judging alignment and submission readiness

<!-- generated: evidence audit, 2026-10-23; no eligibility or scoring guarantee -->

Sources: the user-supplied overview text, the current [event overview](https://qloo.devpost.com/) and [official rules](https://qloo.devpost.com/rules). The four criteria are equally weighted; section 6 screens theme/API viability before comparative judging. These are qualitative judgments, not predicted judge scores.

## Assessment

| Criterion | Current evidence | Assessment and limit |
| --- | --- | --- |
| Technological Implementation | Qloo places/tags/recommendations/heatmaps feed world construction; affinities affect venue profiles and adoption. Web Worker simulation, paired seeded comparisons, snapshots, validated tools, provider fallback and quota controls are implemented. | Strong implementation evidence. Demonstrate a real tool round and Qloo world in production. Do not equate test count or complexity with usefulness. |
| Design | One case journey: inspect → prepare → explicit apply → manual Play/Pause → focused visitors → automatic stop/outcomes → rewind. Separate artist planner reuses the existing shortlist and comparison engine. | Coherent current direction. It must be hosted and rehearsed; the public URL checked here still shows the old sandbox. Provider failures, ties and model limits need legible behavior. |
| Potential Impact | A learner can inspect and repeat a cultural model instead of receiving an unsupported generated story. Artist/host comparisons offer a concrete applied exploration. | Weakest evidence. This is a specific learning hypothesis, not demonstrated demand or educational benefit. No learner study, professional workflow validation or forecast validation exists. Clearer copy reduces overclaiming; it does not prove impact. |
| Quality of the Idea | Non-obvious combination of cultural affinity data, tool-using guidance and visible emergent behavior. Qloo affects inputs beyond names/labels. | Credible originality argument. Explain the authored rules and Qloo dependency clearly. No measured Qloo-versus-generic/LLM-only superiority claim. |

## Specific audience and promise

Primary audience: learners, educators demonstrating agent-based systems, and technically curious visitors. The problem is that a text-only cultural explanation hides its assumptions and cannot be rerun as the same inspectable experiment. Genus Loci exposes a model, a recorded group, an intervention and repeatable playback.

The artist planner asks a practical cultural-fit question under the same model: how does this artist compare across existing hosts? That capability was retained but made inaccessible by the chat-only UI change. The user explicitly requested its separate entry restored. It does not establish that organisers should book those venues or that simulated turnout predicts sales.

Do not claim the product prevents venue closures, solves city policy, models actual residents or has validated professional demand. Retain music/place focus rather than adding fashion/dining just because Qloo supports them; the rules list examples, not a requirement to use all domains.

## Evidence trail

- `src/world/builder/gather.ts` and `assemble.ts`: Qloo gathering, affinity edges, scene starting points and heatmap seeding.
- `src/sim/steps/outing.ts`, `exposure.ts`, `genome.ts`: authored choice/learning rules using cultural inputs.
- `src/sim/whatif.ts`, `booking.ts`, `timeline.ts`: paired model comparisons and rewind/fork.
- `src/agents/copilot.ts`, `tools.ts`, `run-tool.ts`: Vercel AI SDK agent/tool integration, fresh evidence and guarded explicit apply.
- `src/ui/EventPlanner.tsx`, `event-planning.ts`: artist-conditioned existing-venue shortlist and alternative-host comparison.
- `src/sim/case.ts`, `src/ui/case-summary.ts`: observed case reporting and disclosed settling/cap semantics.
- `docs/spikes/2026-10-22-chat-agent-requirements.md`: agentic requirement interpretation and deterministic fallback limitations.

Qloo supplies cultural evidence; simulation behavior is authored. A synthetic version still runs, so the defensible differentiation is loss of city-specific cultural grounding without Qloo, not that generic simulation is impossible. A controlled performance comparison against an LLM-only baseline has not been run. Existing synthetic ALife spike results do not establish such superiority.

## Eligibility/access checks

| Requirement | Checked status on 2026-10-23 |
| --- | --- |
| Public hosted demo | Public root returned HTTP 200 and loaded without login. Browser showed the older Week/Tools/Scenes sandbox, not the current chat-first flow. Current release remains to be published/rehearsed. |
| Qloo world available publicly | London world endpoint returned HTTP 200 with `meta.source=qloo`; aggregate data contained 580 entities and 19,650 edges. Public UI showed 140 open model venues. No payload was saved or committed. |
| Public code repository | GitHub reports `jephoton/genusloci-culture-simulator` PUBLIC. Current local HEAD differed from remote main during audit. |
| Detectable open-source licence | GitHub detects MIT; root LICENSE credits Jethro Tan. |
| Matching text description | Devpost draft, README and pitch updated around the demonstrated lab and restored planner; the form itself was not edited/submitted. |
| Agent component | Source uses Vercel AI SDK tool calling with Qloo/simulation tools. Parser fallback is not claimed as equivalent autonomous reasoning. Deployed provider health remains unverified; legacy public GET availability endpoint returned 405. |
| Demo video | Overview says not required; a usable external app is required. |
| Finalist attendance | Current overview announces top-three live appearances on 5 November and requires preparation/availability if selected. |

Deadline: 31 October 2026, 11:45 am Singapore time. Current rules list judging 2–5 November Eastern time. Keep access available through that period and recheck announcements. The sponsor decides eligibility; this audit is not organizer approval.

## Remaining release gates

1. Local planner/browser verification is complete. Publish the reviewed current branch after resolving the framework release gate below. No merge, push or deployment is implied by this audit.
2. Rehearse the actual public build: Qloo world → AI tool round → artist/host comparison → explicit apply/manual playback → observed completion → rewind. Also try local mode so the fallback is understood.
3. Ensure the public repository and hosted UI match the submission description. Confirm world storage and provider settings in the deployment without exposing keys.
4. Submit the project description and links through Devpost. User completes any binding submission agreement and confirms finalist availability if applicable.

Verification also surfaced an existing framework release risk: Next.js 16.4.0 reports advisories, confirmed through the npm registry's security endpoint. Reported affected ranges include the installed version for [Server Actions denial of service](https://github.com/advisories/GHSA-p3m5-59mp-jv5r), [image optimisation/SVG remote execution](https://github.com/advisories/GHSA-2464-fhr4-w9xw) and [cached typed-array remote execution](https://github.com/advisories/GHSA-673q-mjm6-r5xr). This audit did not establish exploitability in this app or upgrade dependencies. Review/apply a patched framework release and verify it before publishing. A successful local build after the framework warning is not a security fix.

No major new domains or speculative features are needed for alignment. The outstanding product evidence is real audience usefulness; the immediate release problem is making the latest coherent experience the one judges actually receive.

## Project duration

The earliest reachable Git commit is `0c4020f`, authored/committed on 9 October 2026 at 10:50:39 Singapore time. As of 23 October, this is about 14 elapsed calendar days. Commit timestamps do not measure active work hours, and no person-hour estimate is inferred.
