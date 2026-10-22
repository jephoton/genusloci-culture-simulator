# 0008: Live applied cases and change history

<!-- generated: durable implementation decision -->

**Status:** Accepted; user selected live-city playback after explicit apply, with rewind for recovery.

The cultural ecology lab is an ongoing simulation. Numbered weeks and calendar labels distract from the current intervention. Main chat and playback therefore describe changes, cases and checkpoints. Engine activity cycles and existing scheduling/tool units remain internal; this is not an engine time-model rewrite.

An explicit live change pauses the worker, applies its action step, then starts bounded monitored playback. The worker owns stopping and emits one actual observation report. Pause/resume and speed retain the monitor. Rewind interrupts it. Automatic completion waits for the final visible outing before pausing the animation clock and showing results. Explicit finish can stop early. Completed cases retain their focus until finish/resume/rewind; unrelated venue selection, ground clicks and Escape cannot discard it. Inspecting a relevant venue preserves the cohort and displays its name/model health.

Settling is a heuristic: at least three complete activity cycles and two stable consecutive cycle comparisons; visit/outings totals within 10% with a one-outing allowance, health within 0.05, cohort destination-share total variation at most 0.10, no structural change in either compared cycle and nonzero cohort activity. Relevant scheduled/active events block settling. A hard observation cap guarantees stopping, even if effects or distant events remain unresolved. This is not proof of equilibrium or real-world causality.

Reports count tracked venue visits/distinct resident slots and followed-cohort outings after the application step. Health starts after application (or first discovery for delayed/new venues); counts exclude the already-applied step. These observed outcomes are not a paired causal estimate. Before apply, chat confirms case readiness rather than presenting a completed outcome.

Fixed cyan beacons identify targets. Existing other venue colours may follow visiting crowds or matched live scenes; the authored venue taste profile remains fixed. Focus follows the observed pre-change attendee cohort and their destinations, not every resident causally affected by an intervention.

Named history retains the latest 30 case changes in the current session and links to available pre-change snapshots. Engine rewind discards the later future; history is not a persistent multi-branch replay system. Reload/city reset loses this UI history. Saved branches, causal impact traces and side-by-side animated baseline playback remain separate work.
