# 0003 — LLM: provider-agnostic, DeepSeek primary with a free-tier fallback chain

- **Status:** Accepted (2026-10-09)
- **Decision:** All LLM calls (co-pilot, personas, scene naming) go through the Vercel AI SDK using OpenAI-compatible providers. DeepSeek API is the primary provider. On rate limits or errors, fall back through the free tiers of Groq → Cerebras → OpenRouter → Gemini.
- **Alternatives considered:** Anthropic Claude API (the user does not want to pay for it, and a Claude subscription can't power a public app); free tiers only (too fragile during judging); open-weight only (excludes Gemini as a last resort).
- **Rationale:** near-zero cost with a reliable paid primary; open-weight models; no lock-in. Open models are weaker at tool calling, which is mitigated by a small, strictly typed, validated tool set.
- **Follow-up:** verify current models, prices and rate limits in the Phase 1 spike.
