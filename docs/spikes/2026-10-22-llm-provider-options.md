# Free provider evaluation

<!-- generated: researched options and bounded measurements, not a reliability guarantee -->

## Recommendation

**Implemented follow-up:** The user selected Gemini Flash-Lite → Groq → deterministic parsing. See [decision 0007](../decisions/0007-gemini-first-chat.md). Historical statements below about unchanged application priority describe the evaluation stage, before that follow-up.

Gemini Flash-Lite is now the preferred candidate based on bounded live schema and streamed-continuation checks, retaining local commands for supported operations. Groq and Gemini are configured locally. Flash-Lite passed all three schema probes and one synthetic streamed conversation; Flash passed lookup but failed the comparison probe. This small sample does not establish general quality or reliability. Cerebras, OpenRouter and DeepSeek remain untested locally.

## Published offers checked on 2026-10-22

| Provider | Free access and constraints | Fit for this lab |
| --- | --- | --- |
| Gemini | Current pricing lists free standard input/output for `gemini-3.8-flash` and `gemini-3.5-flash-lite`. Actual RPM, input TPM and daily limits depend on model/project and appear in AI Studio. Limits apply per project, not per key. | First candidate to benchmark with actual tools; function calling and structured output are documented for Flash-Lite. A large context window does not establish throughput allowance. |
| Groq | Published free GPT-OSS 120B allowance: 30 RPM, 1,000 requests/day, 8,000 TPM and 200,000 tokens/day. GPT-OSS 20B has the same listed limits. | Already integrated and configured. Smaller GPT-OSS does not itself solve the throughput limit. Multi-round tools repeat context and consume multiple requests. |
| OpenRouter | Free plan lists 50 requests/day. `openrouter/free` routes among free models; tool compatibility and upstream availability still need testing. | Possible occasional fallback, a small allowance for multi-round chat. The application's current OpenRouter default is a paid model, so adding a key alone does not select a free route. |
| Cerebras | Current docs explicitly describe no permanently free tier: a $5 trial lasting 30 days with a verified payment method. | Not the best fit for the user's ongoing free-provider preference. No trial or billing setup was performed. |

Primary sources: [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [Gemini limits](https://ai.google.dev/gemini-api/docs/rate-limits), [Flash-Lite capabilities](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [Groq limits](https://console.groq.com/docs/rate-limits), [OpenRouter pricing](https://openrouter.ai/pricing), [free router](https://openrouter.ai/openrouter/free), [Cerebras trial and limits](https://inference-docs.cerebras.ai/support/rate-limits). Google's free-tier content may be used to improve its products, as disclosed on its pricing page. Offers and project eligibility can change.

## Live evidence

After the user added a Gemini key locally, seven inference requests evaluated two models plus a streamed continuation:

| Probe | Result | Observed elapsed time |
| --- | --- | --- |
| Flash-Lite forced lookup | Pass | 1,435 ms |
| Flash-Lite forced comparison | Pass | 863 ms |
| Flash-Lite forced summary | Pass | 679 ms |
| Flash forced lookup | Pass | 6,649 ms |
| Flash forced comparison | Failed, unclassified; no HTTP status exposed by caught error | 8,049 ms |
| Flash-Lite streamed summary then answer | Selected fresh summary autonomously, consumed synthetic browser output, answered with the fixture's 600 residents, no extra calls | 2,651 ms for two requests |

The streamed check uses the production `copilotStream`, UI-message tool metadata and client-style tool-result continuation. Its first request used 1,688 input / 10 output tokens; continuation used 1,752 / 39. No 429 was observed in these seven requests. This is not a sustained quota test, real browser/worker/HTTP-route rehearsal, broad answer-quality evaluation or proof that Gemini cannot rate-limit. The Flash failure cause remains unresolved; no raw provider error or credential was logged. Application provider ordering and defaults remain unchanged: the app still tries configured Groq before Gemini.

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
# Two requests through the production streaming guide with synthetic tool output.
npx tsx scripts/spike-gemini-chat.ts --live
```

Set `GOOGLE_GENERATIVE_AI_API_KEY` locally in `.env.local` using a key from Google AI Studio, never in chat or committed files. The probe defaults to the verified Flash-Lite candidate; `--model` explicitly selects another candidate and may incur that model's charges. It does not change application settings.

Application integration already exists, but its default copilot ID `gemini-3.5-flash` was absent from the current official model index. Its runtime validity was not tested. Use an explicitly verified `GEMINI_MODEL` override when evaluating the application. `GEMINI_SMALL_MODEL` can select Flash-Lite. Gemini currently follows Groq in provider priority, so adding its key does not make it primary. Fallback only covers failures before a stream begins; the co-pilot's process-wide cooldown can also gate other providers after a rate limit. A provider-selection/cooldown change needs its own implementation and verification.

The schema and synthetic continuation checks are complete. Next rehearse the actual browser/worker path, follow-up references, malformed requests, 429 handling and stream failures, and verify project quota in AI Studio. Application use requires selecting a verified model and intentional provider priority; this evaluation did not change keys, defaults, paid plans or production behavior.
