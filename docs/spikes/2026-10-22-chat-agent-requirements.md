# Chat, orchestration and the agentic requirement

<!-- generated: primary-source requirements research and proposed evaluation; not organizer confirmation or an executed chat spike -->

## Implemented companion spike

The companion now implements chat-first entry with a deterministic parser and optional AI for unsupported questions. Existing city tools execute the commands; application UI and [current walkthrough](../chat-lab-walkthrough.md) distinguish model comparisons from live changes. Background AI naming is disabled. AI's advertised tool set excludes live apply; explicit local commands retain it. This is a bounded experiment in execution/language separation, not organizer confirmation.

`npx tsx scripts/spike-chat-language.ts` evaluated 14 synthetic prompts selected after the initial parser implementation. Eight matched the intended read/compare/live/refuse category; six ordinary paraphrases were rejected, including “What would happen if Alpha Club closed?” and “Would losing Alpha Club change the scene?”. No unintended live mutation occurred. Successful known-grammar fixtures do not establish broad language parity; this language challenge is a small developer-authored sample, not a user study. No live-model head-to-head benchmark, provider latency comparison or cost measurement was performed in this pass.

**Conclusion:** an LLM is unnecessary for executing the supported experiments, resolving known command targets or formatting recorded results. It remains useful for flexible learner questions, paraphrases and contextual explanations. Retain it as optional assistance rather than claim the parser performs equally well. Add new grammar deliberately and evaluate against new prompts instead of repeatedly fitting this same challenge set.

Independent review found interrogative punctuation and declarative first-person phrases could be misclassified, and identified stale AI/local action context and misleading rewind confirmations. These were corrected with parser regressions, explicit handoff/context clearing and success-aware rewind. Tool-schema validation, a client in-flight guard and the existing tool-call ledger remain in the execution path. Provider failures never trigger automatic replay of the user's request.

## Finding

An LLM is **not explicitly mandated** in the published project requirement. An agentic component is required. Those are different conclusions: the text does not guarantee that the organizers would accept our particular deterministic workflow as agentic. A Qloo API response, a chat-shaped command parser, or a population of simulated residents does not by itself demonstrate the requested agentic application.

Research checked the current public sources on 2026-10-22. No provider credentials, environment values, paid model calls or Qloo calls were inspected or used. No organizer was contacted. This note does not certify eligibility.

## What the organizers actually require

Section 4 of the [official rules](https://qloo.devpost.com/rules) requires a working Qloo-integrated application satisfying one of three alternatives:

> “functions as an agentic tool” / “is built using an agent framework” / “integrates the Qloo API into an existing agent”

These quoted fragments total 19 words. The rule names neither a mandatory LLM nor a mandatory provider. The rules reserve eligibility decisions to the sponsor/administrator and screen for reasonable fit to the theme and required technology. Absence of a named LLM requirement is therefore evidence against claiming an explicit mandate, not a binding interpretation that a parser qualifies. [Official rules, sections 4 and 6](https://qloo.devpost.com/rules).

The [event overview](https://qloo.devpost.com/) expects Qloo's cultural evidence to materially improve the application beyond generic model answers. It requires an externally published functional demo, public runnable source, a description explaining the Qloo contribution, and a detectable open-source license. A demo video is optional. These requirements make judge usability and an observable Qloo-dependent workflow more important than adding a framework name to the description.

The rules' third-party integration provision requires authorization under the relevant SDK/API/data terms. Their judging criteria assess Qloo implementation, coherent product design, credible impact and idea quality. A provider choice does not settle those criteria. [Official rules](https://qloo.devpost.com/rules).

## What is supplied, and what is unverified

The [official resources page](https://qloo.devpost.com/resources) points participants to a Qloo key request form and the official kit. The [developer guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide) describes event-issued Qloo keys and their quotas, rate limits and expiry. These are Qloo API access, not evidence of funded language-model inference.

The [official kit README](https://github.com/qloo/qloo-hackathon-kit) offers three routes: terminal chat, CLI JSON workflows and an MCP server. Chat requires separate model-provider sign-in; the CLI needs no additional service; MCP needs a suitable client/backend. The [chat starter](https://github.com/qloo/qloo-hackathon-kit/blob/main/starter/agent-chat/README.md) explicitly instructs separate model setup and warns that files read by that chat go to its model provider. The kit is useful evidence that Qloo access and model access are separate concerns, not proof that every route independently meets the competition's agentic requirement.

**No language-model credit grant or included hosted model was verified in these public sources.** Do not turn that into “no credits exist”: participant emails, private Discord announcements or an unreviewed offer could contain additional information. Budget and select a model only after verifying the actual account/offer and intended hosted-demo use. Installing or reading the kit does not provide inference by itself.

The kit's [submission guide](https://github.com/qloo/qloo-hackathon-kit/blob/main/docs/SUBMISSION.md) encourages a reproducible product flow with request/result provenance, explicit entity/tag choices and limitations. Its generic checklist supplements the event requirements; it does not replace the Devpost demo/public-source requirements.

## Recommended boundary for Genus Loci

Keep execution deterministic and tools explicit. A visitor's experimental goal should produce a bounded sequence: inspect the current world, resolve the entities involved, formulate a valid intervention, run matched futures, inspect results, and report the observed difference with uncertainty. A follow-up can refine that same experiment. The planner must actually select or adapt steps from observations; a fixed macro alone should be described as a workflow.

An optional LLM can interpret varied language, preserve conversational referents and suggest a structured tool plan. It should not invent Qloo IDs, directly mutate simulation state, manufacture numerical results or convert affinities into real-world causal evidence. Tools validate inputs and world identity, enforce bounds, and return inspectable results regardless of how a plan was produced. User-facing text should distinguish the authored simulator's evidence from Qloo's aggregate cultural evidence.

| Approach | Strength | Limit / decision |
| --- | --- | --- |
| Deterministic tools and orchestration, optional LLM semantics | Reproducible effects, cheap guided interactions, clear provenance; model can improve language flexibility when available. | Recommended engineering boundary. Evaluate actual adaptive behavior and language coverage; it does not guarantee organizer acceptance without a model. |
| LLM-only conversation | Broad language coverage. | Insufficient: unsupported answers do not establish Qloo differentiation or verified actions. A model still needs grounded tools and validated execution. |
| Parser-only chat | Predictable supported commands and no model bill. | Useful baseline/fallback. Expose supported actions honestly; brittle paraphrases and canned plans should not be presented as autonomous reasoning. |

Do not add an “agentic” badge as a substitute for behavior. If a model is unavailable, keep guided experiments usable and disclose the supported command surface. For the strongest observable agent integration, demonstrate a real agent choosing and using validated Qloo/simulation tools, while keeping all mutations inside the deterministic boundary. This is a recommendation, not a newly imposed requirement to purchase inference.

## Functional spike and decision criteria

Before expanding chat UI, run a small recorded comparison of the parser baseline and candidate semantic planner against identical tool fixtures. Real provider evaluation remains unexecuted; this note authorizes no provider setup or calls. Include supported happy paths and unseen wording, then examine the trace, not merely the final prose.

1. **Paraphrases:** at least five distinct phrasings per supported intent. Include “What happens if Heaven shuts?”, “Compare the city with and without Heaven,” and “Would losing that venue change the scene?” after selecting a venue. Score correct intent, parameters and preserved selected context. Report unsupported language instead of silently mapping it to a different action.
2. **Clarification:** ambiguous venue/artist names, missing targets, “there,” contradictory scope, and follow-ups after rewind. Require clarification when more than one plausible target remains. Never choose the first search hit merely to keep the conversation moving.
3. **ID resolution:** names resolve to verified entities; tools use the current world and stable entity IDs. Unknown outside artists require a genuine resolver result. No fabricated IDs, stale numeric slots, or claims that an unresolved entity is absent from Qloo entirely.
4. **Tool sequence and evidence:** show inspection before planning where needed, actual comparison calls, returned metrics and a response consistent with those results. Include a negative or inconclusive comparison. Distinguish previews from applied actions.
5. **Side effects:** preview/compare changes no live state. A selected apply operation executes once under retry, repeated callback, duplicate tool delivery or double click. Revalidate world/timeline identity before applying; stale plans fail clearly. Count mutations in the trace and test the result after retry.
6. **Failure behavior:** unavailable model, tool timeout, invalid input, Qloo quota refusal, empty lookup and unsupported request. No invented success, hidden provider substitution or replacement of tool evidence with confident prose.
7. **Qloo contribution:** demonstrate where an actual Qloo-derived input changes the candidate set or experiment setup against a same-scope baseline. Keep Qloo affinity, authored simulation outcomes and real-world predictions separate.

Proposed minimum gate: zero fabricated IDs/results, zero unintended or duplicate mutations, all ambiguity/staleness cases handled explicitly, and a declared intent-success rate on held-out paraphrases. Use measured latency, call count and cost to decide whether semantic flexibility justifies an optional model. A threshold chosen after seeing outputs is not a held-out success criterion.

The [developer guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide) supports the resolver boundary: entity names are looked up through search, tags through the tag endpoint, and valid IDs feed Insights. Unsupported parameters can be silently ignored. Validate supported fields before a request; a successful HTTP response alone does not establish that the intended constraint was applied.

## Next checkpoint

Implement and evaluate one goal-to-comparison flow before broadening the chat promise. Keep the provider decision separate from execution correctness. For submission, describe the exact demonstrated agent/tool behavior and Qloo dependency; preserve the unresolved organizer interpretation if choosing a wholly deterministic route.
