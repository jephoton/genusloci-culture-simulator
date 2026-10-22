# Chat-first cultural ecology lab

<!-- generated: current implemented entry flow -->

The experiment chatbot is the only visible command entry point. Existing simulation functions are reused through the canonical city-tool dispatcher; the former workspaces remain in source as compatibility/result-card components, but their navigation and controls are hidden. The city map remains available for inspection, pan and zoom. Minimize chat to inspect more of the map, then reopen it.

The empty input displays an example prompt inside the box; a reply's explicit recommendation can replace that example. Focus the input and press **→** to fill exactly the displayed placeholder, or finish a matching prefix with the cursor at its end. Filling never sends: edit the prompt, then press Enter or Send. Right Arrow retains normal cursor/selection behavior elsewhere in your draft. There is no separate suggestion below the input.

Labeled next-prompt recommendations are hidden from the assistant's displayed reply and appear only as the input placeholder. Their internal labels are not shown to the visitor.

## First experiment without a language model

For this deterministic rehearsal, disable **Chat options and limits → Use AI guide** first. With AI enabled, questions instead try Gemini, then Groq, then local parsing.

1. Load London and ask **What can I do?** or **How do tastes evolve?**
2. Ask **Show the busiest venues**. At the initial tick, visits may all be zero. Say **play**, let the city run, then **pause** before comparing. Tied busiest targets require a named venue; the bot does not arbitrarily choose one.
3. Use an actual full name from the list, e.g. **What if Cirque Le Soir closes for 4 weeks?**. This runs four seeded scenario/no-change pairs and reports recorded totals/ranges. It does not advance or modify the live city. A selected venue is focused on the map.
4. Inspect the differences and uncertainty. **Apply that** applies the latest successful comparison, whether it came from AI or local interpretation. It is consumed once and rejected after a rewind or a target slot changing identity. A newer failed comparison clears the older one. **close <full venue name>** directly requests a live closure. Successful live changes automatically resume playback so their effect is visible; say **pause** to stop. **Close <venue>?** asks for a comparison, not a live action. A question ending in `?!` is also treated as a question.
5. Say **rewind to day 0** to restore an earlier state and discard its later future. The confirmation appears only after a successful rewind. Local target/action references and AI context are cleared.

Other supported local examples: **summary**, **scenes**, **find venue Heaven**, **tell me about Heaven**, **what if we open a cafe in Soho?**, **open a cafe in Soho**, and **what if rent rises by 20% in Soho?**. Area and venue names must resolve against the loaded world. Results describe hypothetical model businesses and visits, not real openings, closures or ticket sales.

## Two interpretation paths

With AI enabled and configured, questions try **Gemini Flash-Lite → Groq → deterministic local parser**. Missing providers are skipped. Local parsing is also used directly when AI is disabled or the exhausted provider chain is cooling down. Its bounded grammar clarifies unknown/ambiguous targets and does not cover every tool, outside-artist lookup, arbitrary paraphrases or open-ended conversation.

**Chat options and limits → Use AI guide** disables provider requests. AI receives bounded recent local evidence plus current timeline identity; it must refresh current city facts. It can inspect and compare but cannot mutate the live city. Explicit live commands such as **close <full venue name>**, **apply that**, and exact playback/rewind commands always run locally. Successful comparisons save their validated resolved actions in shared memory; apply does not infer an action from the model's prose. Pending comparisons survive read-only follow-up questions but clear on a new comparison attempt, live mutation, clear-chat or timeline change.

Comparisons pause the city. Their focus, and the focus after applying, highlights the target venues and the observed pre-change visitor group. Those people remain highlighted when they leave the closed venue, and their current destination venues stay bright. Unrelated residents/venues and background buildings dim; broad scene glows and general change effects are suppressed. A target beacon and a **Clear highlights** control keep the target legible. This is a bounded observed cohort, not a claim to identify every causally affected resident. A comparison before any outings may have zero observed visitors.

Provider failover handles request errors, initial stream errors and empty responses before user-visible text or a tool call begins. Once answer/tool output begins, providers are not replayed; an exhausted/failed AI question falls back to deterministic interpretation, which may repeat a read-only lookup or hypothetical comparison but cannot duplicate a live action. Unsupported local language receives clarification. The existing cooldown applies after exhausted provider rate limits; it does not intercept a successful Groq fallback. Clearing chat does not bypass cooldown or reset the city. Background LLM scene naming remains disabled.

“Local” means LLM-free operation against a loaded world; it does not mean city loading or live Qloo requests work without network/storage access. Qloo remains the source of the prebuilt city's taste relationships. No LLM-free mode is represented as equivalent to unrestricted language understanding.

## Limits and unfinished learning work

This change supplies the chat entry and tool orchestration. It does not implement animated baseline/scenario replay, recorded resident routes, taste-change traces or the full guided learning-versus-frozen experiment proposed in the product spikes. Comparison summaries are deterministic model evidence. Fidelity is not displayed as confidence. Existing model assumptions about generated capacities, behavior, clustering and automatic openings remain; this interface change does not validate them.

The intended audience is learners and technically curious visitors investigating the authored cultural model. The AI guide is optional assistance, not the residents' decision engine. Hackathon eligibility interpretation is discussed in [requirements research](spikes/2026-10-22-chat-agent-requirements.md).
