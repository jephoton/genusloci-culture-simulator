# ALife purpose spike: keep the simulation

<!-- generated: bounded exploratory spike; not a product decision or user validation -->

## Recommendation

Keep Genus Loci as a **playable cultural ecology laboratory**: a portfolio project that lets someone inspect, perturb, rewind and compare a small artificial society. Its immediate value is making feedback, path dependence and modeling assumptions tangible. Interesting ALife research and an excellent technical demonstration are valid outcomes independently of business ROI or a hackathon placing.

Suggested portfolio narrative:

> I built a deterministic cultural ecosystem with thousands of synthetic residents, evolving taste profiles, social influence and venue lifecycles. You can intervene, rewind and compare seeded futures. The project explores which simple mechanisms can produce persistent cultural patterns, and makes the assumptions and limits visible.

“Evolving taste profiles” here means adoption, reinforcement, drift and decay. This engine does not implement the self-replicating, heritably mutating digital organisms of Avida. Scene births and splits are partly outputs of clustering and lineage rules; they are not, by themselves, evidence of open-ended evolution or genuine new culture. Real-world taste affinities can ground initial conditions without validating the subsequent dynamics.

This recommendation is an inference from the implementation and the sources below. No user interviews, educator trials, promoter validation or observed audience outcomes were collected in this spike.

## Three candidate purposes

| Purpose | Problem it could solve | Defensible claim and audience | Existing fit | Next evidence needed |
| --- | --- | --- | --- | --- |
| 1. Interactive explanation and portfolio exhibit | Feedback between individual preferences, friends, cultural exposure and local institutions is difficult to reason about from static charts. | Learners and technically curious visitors can explore how the implemented rules produce macro patterns. Explain this artificial world; propose possible mechanisms for real ones. | Strong: live city, resident inspection, scene history, interventions, exact rewind, local tick engine. | One guided question with an observable result, a short rules/assumptions panel, and a comprehension check with actual learners. |
| 2. Experimental cultural ecology workbench | Intuition alone cannot establish whether a proposed mechanism is sufficient, necessary or robust inside a model. | ALife/ABM enthusiasts can run falsifiable computational experiments about this model: e.g. whether social attraction changes venue concentration, or whether turnover prevents taste lock-in. | Promising: seeded RNG, config controls, synthetic fixtures, cloneable state, hashes, paired comparisons. | Explicit hypotheses, batch runs across seeds and world structures, parameter sweeps, null models, diversity/turnover measures, reproducible reports and an ODD model description. |
| 3. Scenario conversation aid, eventually bounded decision support | Cultural organizers may need a shared language for discussing displacement, access, diversity or event spillovers. | Today: a facilitated, explicitly hypothetical exercise that exposes assumptions. Future actual decision support would require evidence for a named decision in a named setting. | Partial: events, closures, rent actions, demand niches, booking comparisons and visit summaries already express relevant scenarios. | Observed longitudinal attendance/closure data, identified behavioral parameters, time/space/population scaling, holdout prediction, intervention validation, stakeholder review and decision-specific error tolerances. |

Choose purpose 1 as the public promise and purpose 2 as the technical depth behind it. Treat purpose 3 as a research question, not a claim of booking accuracy. A hypothetical scenario workshop can be useful without recommending expenditure. This scope preserves the simulation rather than turning it into decoration around a recommendation API.

## Why these are legitimate simulation purposes

- **Explanatory tool:** Northwestern's [NetLogo Segregation model](https://ccl.northwestern.edu/netlogo/models/Segregation) demonstrates how local preference and relocation rules generate neighborhood patterns, with explicit controls and things to try. Its relevance is the inspectable micro-to-macro explanation, not an assertion that this project has modeled residential segregation accurately.
- **Actual ALife research:** Lenski, Ofria, Pennock and Adami's [The evolutionary origin of complex features, Nature (2003)](https://www.nature.com/articles/nature01568) used self-replicating digital organisms to investigate complex logic functions arising through evolution. This illustrates substantive research value in a deliberately artificial system. Genus Loci's appropriate analogue is a controlled experiment about its own mechanisms, not equivalence to Avida or proof about human culture.
- **Actual planning application:** [MATSim's official site](https://matsim.org/) identifies an all-Switzerland model operated by Swiss Federal Railways since around 2018 for planning. This is evidence that agent-based tools can have operational applications; it does not transfer validity to a different model or domain.
- **Methodological standard:** Grimm et al.'s [ODD protocol update, JASSS (2020)](https://www.jasss.org/23/2/7.html) ties reproducibility to explicit purpose, design rationale and evaluation. A beautiful artificial city can be a successful explanatory model while remaining unsuitable for a specific real-world forecast. Fitness for a purpose must be demonstrated for that purpose.

These are primary model documentation, a primary research paper, the tool maintainers' application account, and a primary methodology paper, respectively. Sources were inspected on 2026-10-22; no source was used to infer customer demand.

## Implementation evidence and limits

Inspected `src/sim/config.ts`, `step.ts`, `steps/outing.ts`, `steps/exposure.ts`, `steps/ecology.ts`, `calibration.ts`, `whatif.ts`, `hash.ts`, their selected tests, `scripts/calibrate.ts`, `src/world/fixtures/tiny-world.ts`, and `docs/architecture.md`.

- The pure TypeScript engine runs without network or DOM. `step` applies actions, scheduled events, residential ecology, outings, attendance, learning, drift, decay, venue updates and periodic clustering/auto-opening. The order is a model assumption worth documenting.
- Outing choice is a softmax over taste affinity, distance and friends' previous attendance. Events receive no distance penalty once within reach. This simplification can dominate an event comparison and should be visible in a research presentation.
- Taste adoption depends on affinity and friends holding the entity; attendance also reinforces matching tastes and samples a co-attendee's strongest taste. The `friendBonus` and `socialWeight` parameters operate through different mechanisms.
- Optional moves and resident turnover exist but both default to zero. Default scenes use warm-started clustering. A baseline can therefore stay close to the initial archetypes even when the display looks lively.
- Timeline cloning/replay and `hashState` support reproducibility. The what-if implementation uses four same-initial-seed baseline/scenario pairs, reports mean/range and agreement, and caps horizons at 26 weeks. Those ranges describe sampled simulation randomness; they are not calibrated confidence intervals for real-world outcomes. Branches may consume different random draws after an intervention, so paired seeds do not guarantee persistent event-by-event randomness alignment.
- `computeFidelity` is mean Spearman correlation between mean resident taste weight and heatmap affinity across populated home cells. Tests check rank arithmetic, initialization agreement and a shuffled-home control. This is a spatial consistency diagnostic. It does not test future attendance, venue closure or causal intervention accuracy. Synthetic heatmaps share the fixture's archetype construction; held-out real heatmaps would still be same-source spatial checks, not independent temporal behavioral validation.
- Demand scores, health, capacity, rent response, gene limits, graph coverage and cluster thresholds can shape apparent emergence. A scene-count change needs membership/diversity evidence and threshold sensitivity checks before being described as cultural innovation.

## Small local experiment: remove social attraction in outing choice

**Question:** In this synthetic setup, does removing the direct friend-at-venue bonus consistently reduce concentration of cumulative venue visits?

**Design:** fixed synthetic world seed 7; six planted taste clusters, 20 entities per cluster and a 10×10 grid; 600 agents; simulation seeds 1–10; 52 weekly ticks. Compare defaults (`friendBonus=1.5`) with `friendBonus=0`; all other defaults remain, including social taste adoption, venue closures and auto-opening. This isolates one parameter change, not removal of all social influence. Population reserve is set to zero. The repeated baseline seed 1 checks exact final-state repeatability.

**Measure:** cumulative attendance shares by venue slot over the full run; concentration HHI = sum of squared shares. Larger values mean more concentrated visits. This is a compact model diagnostic, not a measured cultural-diversity or commercial-success metric.

**Verified results:** all 20 runs ended with six live scenes. Removing the bonus increased HHI in five seeds and decreased it in five. Mean paired HHI change (ablated minus baseline) was **−0.0000033980732764123112**. There is no consistent directional concentration response in this small setup. This is useful negative evidence against making the bonus the centerpiece of a predetermined emergence story; it does not establish a null effect generally. No significance claim is made. Strong planted clusters, other social mechanisms, geography and lifecycle feedback remain plausible explanations to investigate.

| Sim seed | Default HHI | Bonus-zero HHI | Default final hash | Bonus-zero final hash |
| --- | ---: | ---: | --- | --- |
| 1 | 0.04972030553227074 | 0.049085028198293974 | 516de407 | 84436975 |
| 2 | 0.049300988398477005 | 0.04936547606454697 | 66e79e62 | 7c9227b9 |
| 3 | 0.04763873806501155 | 0.04819939702761919 | aff56141 | 83a8ce00 |
| 4 | 0.04825172299761531 | 0.04906453364101602 | cf800ed4 | 235be9e1 |
| 5 | 0.048506089175879084 | 0.048050872368404406 | 4138dfe7 | 7bfb0c9d |
| 6 | 0.047888233544996106 | 0.04895836673261265 | 636002cf | 5e3ca18a |
| 7 | 0.0504771043799915 | 0.049151825529280574 | 56d92722 | 582bb347 |
| 8 | 0.04960983485053083 | 0.04934141490312491 | e6421189 | 6da22f5e |
| 9 | 0.048809815365647845 | 0.04950770990505039 | e355c31d | 8afc1f63 |
| 10 | 0.04983049178810158 | 0.04927471899580835 | f76a6178 | 38265c0c |

Repeated baseline seed 1 returned hash `516de407`, 14,140 cumulative visits, fidelity `0.9075569841061704`, six scenes and the identical HHI. Hashes are repeatability diagnostics, not cryptographic provenance or proof of correctness.

### Reproduction and verification

The parent agent independently reproduced the experiment using the committed `npx tsx scripts/spike-alife-purpose.ts` entry point. It asserts exact repeatability for the seed-one report and saves results in ignored `.cache/spikes/alife-ablation.json`. The reproduced mean delta, five/five sign split and `516de407` baseline hash match the findings below.

Executed from the repository root on 2026-10-22 with Node `v24.12.0`, existing installed `tsx`, and HEAD `9ea09d660d3b8c596d24f444d227ed124857a20c`. This records the base revision; no claim is made that the wider working tree was clean. No dependencies were installed, application files changed, environment files read, provider calls made, or real Qloo worlds loaded. External source browsing above was separate from the local experiment.

Exact successful PowerShell experiment command (exit code 0):

```powershell
$spikeCode = @'
import { makeTinyWorld } from './src/world/fixtures/tiny-world.ts';
import { DEFAULT_CONFIG } from './src/sim/config.ts';
import { initState } from './src/sim/state.ts';
import { step } from './src/sim/step.ts';
import { computeFidelity } from './src/sim/calibration.ts';
import { hashState } from './src/sim/hash.ts';
const world = makeTinyWorld({seed:7,clusters:6,entitiesPerCluster:20,gridSize:10});
function run(seed,friendBonus) {
 const s=initState(world,{...DEFAULT_CONFIG,nAgents:600,agentReserve:0,friendBonus},seed);
 const visits=new Float64Array(s.venueEntity.length);
 for(let t=0;t<52;t++){step(s);for(let v=0;v<s.nVenues;v++)visits[v]+=s.venueAttendance[v];}
 const total=visits.reduce((a,b)=>a+b,0);
 const hhi=visits.reduce((a,b)=>a+(b/total)**2,0);
 return {seed,friendBonus,hhi,fidelity:computeFidelity(s).mean,scenes:s.scenes.live.length,total,hash:hashState(s)};
}
const rows=Array.from({length:10},(_,i)=>({baseline:run(i+1,1.5),ablated:run(i+1,0)}));
const deltas=rows.map(r=>r.ablated.hhi-r.baseline.hhi);
console.log(JSON.stringify({rows,meanHHIDelta:deltas.reduce((a,b)=>a+b,0)/10,positive:deltas.filter(x=>x>0).length,negative:deltas.filter(x=>x<0).length,repeatSeed1:run(1,1.5)},null,2));
'@
node --import tsx --input-type=module -e $spikeCode
```

Targeted existing test command (exit code 0):

```powershell
& .\node_modules\.bin\vitest.cmd run src/sim/calibration.test.ts src/sim/step.test.ts src/sim/whatif.test.ts
```

Result: **3 test files passed, 20 tests passed**, reported duration 4.13 seconds. This verifies selected consistency/determinism/comparison behavior, not empirical validity. `pnpm` was unavailable on this session's PATH; the successful commands use installed dependencies directly. An earlier multiline invocation through `tsx.cmd -e` was unsuitable for PowerShell argument forwarding; the direct Node command above produced the recorded output.

## Smallest useful continuation

First publish a single inspectable experiment with its negative result and explicit assumptions. Then compare social choice and social adoption separately across weaker/stronger initial segregation and different world seeds, reporting concentration, membership turnover and taste diversity together. Add an ODD-style model description before increasing the number of mechanisms. Only pursue a real decision-support claim after choosing one concrete decision and obtaining the independent observations needed to evaluate it.

Success for the next portfolio iteration is that a visitor can state a hypothesis, change one mechanism, reproduce a comparison and explain what the result does and does not support. That is a substantial outcome even if no commercial planning use emerges.
