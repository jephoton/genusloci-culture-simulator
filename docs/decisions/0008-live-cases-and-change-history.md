# 0008: Live applied cases and change history

<!-- generated: durable implementation decision -->

**Status:** Accepted; user selected live-city playback after explicit apply, with rewind for recovery.

**Playback policy amendment:** User starts/stops playback with the bottom Play/Pause buttons. Applying an intervention arms the monitor paused; chat start/stop/resume/finish requests provide control directions. Exit case/view remains an explicit button. Cases still stop automatically at their observation endpoint. This supersedes automatic start on apply and chat-operated finish/resume described below. Placeholder background buildings are omitted to distinguish actual venue landmarks clearly.

The cultural ecology lab is an ongoing simulation. Numbered weeks and calendar labels distract from the current intervention. Main chat and playback therefore describe changes, cases and checkpoints. Engine activity cycles and existing scheduling/tool units remain internal; this is not an engine time-model rewrite.

An explicit live change pauses the worker, applies its action step, then starts bounded monitored playback. The worker owns stopping and emits one actual observation report. Pause/resume and speed retain the monitor. Rewind interrupts it. Automatic completion waits for the final visible outing before pausing the animation clock and showing results. Explicit finish can stop early. Completed cases retain their focus until finish/resume/rewind; unrelated venue selection, ground clicks and Escape cannot discard it. Inspecting a relevant venue preserves the cohort and displays its name/model health.

Settling is a heuristic: at least three complete activity cycles and two stable consecutive cycle comparisons; visit/outings totals within 10% with a one-outing allowance, health within 0.05, cohort destination-share total variation at most 0.10, no structural change in either compared cycle and nonzero cohort activity. Relevant scheduled/active events block settling. A hard observation cap guarantees stopping, even if effects or distant events remain unresolved. This is not proof of equilibrium or real-world causality.

Reports count tracked venue visits/distinct resident slots and followed-cohort outings after the application step. Health starts after application (or first discovery for delayed/new venues); counts exclude the already-applied step. These observed outcomes are not a paired causal estimate. Before apply, chat confirms case readiness rather than presenting a completed outcome.

Following user feedback, target beacons use the closest live taste scene rather than forced cyan. Sign colours follow visiting crowds; body/beacon colours follow matched live scenes. Scene centroids evolve, so the closest scene can change even though the authored venue taste profile remains fixed. Focus follows recorded recent visitors and their destinations, not every resident causally affected by an intervention. A bounded per-resident outing ring is cloned with snapshots and transmitted in frames; recycling event/resident slots clears old visitor attribution. Raw final event attendance remains available for event accounting, while frames filter attendance belonging to an expired/reused lifetime.

The visitor can click Exit case/view to release focus and pause while retaining applied city changes. A validated new intervention finishes the prior observation automatically, refreshes/revalidates context and starts the replacement case from the changed city. Read-only lookups preserve case focus restrictions. This supersedes the original requirement to finish/resume manually before another intervention.

Named history retains the latest 30 case changes in the current session and links to available pre-change snapshots. Engine rewind discards the later future; history is not a persistent multi-branch replay system. Reload/city reset loses this UI history. Saved branches, causal impact traces and side-by-side animated baseline playback remain separate work.
