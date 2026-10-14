import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { type LanguageModel, wrapLanguageModel } from "ai";

// Provider-agnostic LLM access (decision 0003): DeepSeek first, then free tiers. Server-side only.

export type Model = Exclude<LanguageModel, string>;
export type Tier = "copilot" | "small";

type Env = Record<string, string | undefined>;

interface ProviderSpec {
  name: string;
  keyVar: string;
  /** Upper-case prefix for model overrides: `<PREFIX>_MODEL`, `<PREFIX>_SMALL_MODEL`. */
  prefix: string;
  models: Record<Tier, string>;
  create: (apiKey: string, modelId: string) => Model;
}

export const PROVIDERS: ProviderSpec[] = [
  {
    name: "deepseek",
    keyVar: "DEEPSEEK_API_KEY",
    prefix: "DEEPSEEK",
    models: { copilot: "deepseek-v4-flash", small: "deepseek-v4-flash" },
    create: (apiKey, id) => createDeepSeek({ apiKey })(id),
  },
  {
    name: "groq",
    keyVar: "GROQ_API_KEY",
    prefix: "GROQ",
    models: { copilot: "openai/gpt-oss-120b", small: "llama-3.1-8b-instant" },
    create: (apiKey, id) => createGroq({ apiKey })(id),
  },
  {
    name: "cerebras",
    keyVar: "CEREBRAS_API_KEY",
    prefix: "CEREBRAS",
    models: { copilot: "gpt-oss-120b", small: "gpt-oss-120b" },
    create: (apiKey, id) => createOpenAICompatible({ name: "cerebras", baseURL: "https://api.cerebras.ai/v1", apiKey })(id),
  },
  {
    name: "openrouter",
    keyVar: "OPENROUTER_API_KEY",
    prefix: "OPENROUTER",
    models: { copilot: "deepseek/deepseek-v4-flash", small: "deepseek/deepseek-v4-flash" },
    create: (apiKey, id) => createOpenAICompatible({ name: "openrouter", baseURL: "https://openrouter.ai/api/v1", apiKey })(id),
  },
  {
    name: "gemini",
    keyVar: "GOOGLE_GENERATIVE_AI_API_KEY",
    prefix: "GEMINI",
    models: { copilot: "gemini-3.5-flash", small: "gemini-3.5-flash-lite" },
    create: (apiKey, id) => createGoogleGenerativeAI({ apiKey })(id),
  },
];

/** The configured chain for a tier: providers with a key, in priority order, with any model overrides. */
export function providerChain(tier: Tier, env: Env = process.env): { name: string; modelId: string; model: Model }[] {
  return PROVIDERS.flatMap((p) => {
    const key = env[p.keyVar]?.trim();
    if (!key) return [];
    const modelId = env[`${p.prefix}_${tier === "small" ? "SMALL_MODEL" : "MODEL"}`]?.trim() || p.models[tier];
    return [{ name: p.name, modelId, model: p.create(key, modelId) }];
  });
}

type WrappedModel = ReturnType<typeof wrapLanguageModel>;

/** Aborts are the caller's choice, not a provider failure. */
const isAbort = (e: unknown) => e instanceof Error && e.name === "AbortError";

/**
 * One model over a chain: a call that fails before streaming anything (rate limit, outage, bad key)
 * moves on to the next model. Errors after a stream has started are not retried.
 */
export function fallbackModel(models: Model[], onFallback?: (failed: number, error: unknown) => void): WrappedModel {
  if (models.length === 0) throw new Error("fallbackModel needs at least one model");
  const [first, ...rest] = models;
  if (rest.length === 0) return wrapLanguageModel({ model: first, middleware: [] });
  const next = fallbackModel(rest, onFallback && ((i, e) => onFallback(i + 1, e)));
  return wrapLanguageModel({
    model: first,
    middleware: {
      wrapGenerate: async ({ doGenerate, params }) => {
        try {
          return await doGenerate();
        } catch (e) {
          if (isAbort(e)) throw e;
          onFallback?.(0, e);
          return next.doGenerate(params);
        }
      },
      wrapStream: async ({ doStream, params }) => {
        try {
          return await doStream();
        } catch (e) {
          if (isAbort(e)) throw e;
          onFallback?.(0, e);
          return next.doStream(params);
        }
      },
    },
  });
}

/** The tier's model over every configured provider, or null when no LLM key is set. */
export function modelFor(tier: Tier, env: Env = process.env): WrappedModel | null {
  const chain = providerChain(tier, env);
  if (chain.length === 0) return null;
  return fallbackModel(
    chain.map((c) => c.model),
    (i, e) => console.warn(`[agents] ${chain[i].name} failed; falling back:`, e instanceof Error ? e.message : e),
  );
}
