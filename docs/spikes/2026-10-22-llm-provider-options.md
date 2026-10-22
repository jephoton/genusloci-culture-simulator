# Free provider evaluation

<!-- generated: researched options and bounded measurements, not a reliability guarantee -->

## Recommendation

Test Gemini next, retaining local commands as the reliable path for supported operations. Compare Gemini Flash-Lite for command interpretation with Flash for explanations. This is a candidate selection based on published capabilities and cost, not a measured Gemini quality or reliability result. Only Groq is configured locally; no Gemini, Cerebras, OpenRouter or DeepSeek request was possible in this evaluation.

## Published offers checked on 2026-10-22

| Provider | Free access and constraints | Fit for this lab |
| --- | --- | --- |
| Gemini | Current pricing lists free standard input/output for `gemini-3.8-flash` and `gemini-3.5-flash-lite`. Actual RPM, input TPM and daily limits depend on model/project and appear in AI Studio. Limits apply per project, not per key. | First candidate to benchmark with actual tools; function calling and structured output are documented for Flash-Lite. A large context window does not establish throughput allowance. |
| Groq | Published free GPT-OSS 120B allowance: 30 RPM, 1,000 requests/day, 8,000 TPM and 200,000 tokens/day. GPT-OSS 20B has the same listed limits. | Already integrated and configured. Smaller GPT-OSS does not itself solve the throughput limit. Multi-round tools repeat context and consume multiple requests. |
| OpenRouter | Free plan lists 50 requests/day. `openrouter/free` routes among free models; tool compatibility and upstream availability still need testing. | Possible occasional fallback, a small allowance for multi-round chat. The application's current OpenRouter default is a paid model, so adding a key alone does not select a free route. |
| Cerebras | Current docs explicitly describe no permanently free tier: a $5 trial lasting 30 days with a verified payment method. | Not the best fit for the user's ongoing free-provider preference. No trial or billing setup was performed. |

Primary sources: [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [Gemini limits](https://ai.google.dev/gemini-api/docs/rate-limits), [Flash-Lite capabilities](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [Groq limits](https://console.groq.com/docs/rate-limits), [OpenRouter pricing](https://openrouter.ai/pricing), [free router](https://openrouter.ai/openrouter/free), [Cerebras trial and limits](https://inference-docs.cerebras.ai/support/rate-limits). Google's free-tier content may be used to improve its products, as disclosed on its pricing page. Offers and project eligibility can change.

## Live evidence

Two bounded Groq runs used `openai/gpt-oss-120b` with the application's model-facing schemas, forcing a named tool without executing it. Both passed venue lookup and failed the comparison request with HTTP 400. The diagnostic run classified the provider response as `tool_generation_failed`. This is distinct from the previously observed 429 token limit; neither failure class should be presented as the sole cause of unreliable chat.

Diagnostic lookup: 584 ms, 1,421 input tokens and 41 output tokens. Comparison failed after 615 ms. Four inference requests total across the two runs; each stopped at its first failure. Summary was not attempted. These synthetic checks do not test autonomous tool selection, end-to-end streaming, grounded explanations, sustained load or real-world reliability. No Qloo calls, city mutations or provider fallback occurred. Reports contain usage/status only and stay in ignored `.cache/spikes/providers/`.

## Reproduce and next checkpoint

```sh
# Inventory only; prints configured booleans, never key values.
npx tsx scripts/spike-llm-providers.ts
# At most three requests, stops on failure, no retries or tool execution.
npx tsx scripts/spike-llm-providers.ts --live --provider groq
npx tsx scripts/spike-llm-providers.ts --live --provider gemini
npx tsx scripts/spike-llm-providers.ts --live --provider gemini --model gemini-3.8-flash
```

Set `GOOGLE_GENERATIVE_AI_API_KEY` locally in `.env.local` using a key from Google AI Studio, never in chat or committed files. The probe defaults to the verified Flash-Lite candidate; `--model` explicitly selects another candidate and may incur that model's charges. It does not change application settings.

Application integration already exists, but its default copilot ID `gemini-3.5-flash` was absent from the current official model index. Its runtime validity was not tested. Use an explicitly verified `GEMINI_MODEL` override when evaluating the application. `GEMINI_SMALL_MODEL` can select Flash-Lite. Gemini currently follows Groq in provider priority, so adding its key does not make it primary. Fallback only covers failures before a stream begins; the co-pilot's process-wide cooldown can also gate other providers after a rate limit. A provider-selection/cooldown change needs its own implementation and verification.

After a key is configured, first run both schema probes, then rehearse real multi-round conversations, follow-up references, malformed requests, 429 handling and stream failures. Record success, grounded correctness, token consumption and response time before selecting a primary. No keys, defaults, paid plans or production behavior were changed by this evaluation.
