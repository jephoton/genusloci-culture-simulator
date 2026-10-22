# Chat-first cultural ecology lab

<!-- generated: current implemented entry flow -->

The experiment chatbot is the only visible command entry point. Existing simulation functions are reused through the canonical city-tool dispatcher; the former workspaces remain in source as compatibility/result-card components, but their navigation and controls are hidden. The city map remains available for inspection, pan and zoom. Minimize chat to inspect more of the map, then reopen it.

## First experiment without a language model

1. Load London and ask **What can I do?** or **How do tastes evolve?**
2. Ask **Show the busiest venues**. At the initial tick, visits may all be zero. Say **play**, let the city run, then **pause** before comparing. Tied busiest targets require a named venue; the bot does not arbitrarily choose one.
3. Use an actual full name from the list, e.g. **What if Cirque Le Soir closes for 4 weeks?**. This runs four seeded scenario/no-change pairs and reports recorded totals/ranges. It does not advance or modify the live city. A selected venue is focused on the map.
4. Inspect the differences and uncertainty. **Apply that** explicitly changes the live model; **close <full venue name>** directly requests a live closure. **Close <venue>?** asks for a comparison, not a live action. A question ending in `?!` is also treated as a question.
5. Say **rewind to day 0** to restore an earlier state and discard its later future. The confirmation appears only after a successful rewind. Local target/action references and AI context are cleared.

Other supported local examples: **summary**, **scenes**, **find venue Heaven**, **tell me about Heaven**, **what if we open a cafe in Soho?**, **open a cafe in Soho**, and **what if rent rises by 20% in Soho?**. Area and venue names must resolve against the loaded world. Results describe hypothetical model businesses and visits, not real openings, closures or ticket sales.

## Two interpretation paths

Supported local commands are interpreted deterministically and use the same validated tools as the former co-pilot. There is no model request for these commands. Unknown/ambiguous targets are clarified; missing data is not fabricated. The parser accepts one bounded command at a time. It does not cover every simulation tool, outside-artist lookup, arbitrary paraphrases or open-ended conversation.

If a provider is configured, unsupported questions may use AI. **Chat options and limits → Use AI for unsupported questions** lets the user disable it. AI receives bounded recent local evidence plus current timeline identity; it must refresh current city facts. It can inspect and compare but cannot mutate the live city. To apply an AI-described change, restate a supported explicit local command. Passing control to AI clears pending local references so **apply that** cannot accidentally apply an older local comparison.

Provider failure leaves local chat available. A failed AI request is not automatically re-executed, because tool work may already have happened. The visible notice explains this and offers local commands; the existing provider cooldown still applies to AI. Clearing chat does not bypass provider cooldown or reset the model city. Background LLM scene naming is disabled, removing unsolicited naming requests from this path.

“Local” means LLM-free operation against a loaded world; it does not mean city loading or live Qloo requests work without network/storage access. Qloo remains the source of the prebuilt city's taste relationships. No LLM-free mode is represented as equivalent to unrestricted language understanding.

## Limits and unfinished learning work

This change supplies the chat entry and tool orchestration. It does not implement animated baseline/scenario replay, recorded resident routes, taste-change traces or the full guided learning-versus-frozen experiment proposed in the product spikes. Comparison summaries are deterministic model evidence. Fidelity is not displayed as confidence. Existing model assumptions about generated capacities, behavior, clustering and automatic openings remain; this interface change does not validate them.

The intended audience is learners and technically curious visitors investigating the authored cultural model. The AI guide is optional assistance, not the residents' decision engine. Hackathon eligibility interpretation is discussed in [requirements research](spikes/2026-10-22-chat-agent-requirements.md).
