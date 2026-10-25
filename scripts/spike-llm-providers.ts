import { mkdir, writeFile } from "node:fs/promises";
import { generateText } from "ai";
import { PROVIDERS } from "../src/agents/providers";
import { MODEL_CLIENT_TOOLS } from "../src/agents/tools";

// Dry inventory by default. Explicit --live --provider NAME enables at most
// three inference requests, with no retries, fallback, Qloo or tool execution.
try { process.loadEnvFile(".env.local"); } catch { /* use existing environment */ }

async function main() {
  const name = process.argv[process.argv.indexOf("--provider") + 1];
  const live = process.argv.includes("--live");
  if (!live) {
    console.log(JSON.stringify(PROVIDERS.map((p) => ({ provider: p.name, configured: Boolean(process.env[p.keyVar]?.trim()) })), null, 2));
    return;
  }
  const provider = PROVIDERS.find((p) => p.name === name);
  if (!provider) throw new Error("Choose one known provider explicitly.");
  const key = process.env[provider.keyVar]?.trim();
  if (!key) { console.log(JSON.stringify({ provider: name, status: "not_configured", requests: 0 })); return; }
  // Gemini candidate is verified against current official pricing/model docs.
  // This is a benchmark override only; application config/defaults are untouched.
  const modelArg = process.argv.indexOf("--model");
  const modelId = (modelArg >= 0 ? process.argv[modelArg + 1] : undefined) || (provider.name === "gemini" ? "gemini-3.5-flash-lite" : provider.name === "openrouter" ? "openrouter/free" : process.env[`${provider.prefix}_MODEL`]?.trim() || provider.models.copilot);
  const model = provider.create(key, modelId);
  const tools = Object.fromEntries(Object.entries(MODEL_CLIENT_TOOLS).filter(([tool]) => tool !== "apply"));
  const cases = [
    { name: "lookup", tool: "find" as const, prompt: "Emit find with query Alpha Club and kind venue." },
    { name: "comparison", tool: "what_if" as const, prompt: "Verified fixture: Alpha Club is current venue 0. Emit what_if closing that venue for 4 weeks." },
    { name: "summary", tool: "city_summary" as const, prompt: "Emit city_summary with no parameters." },
  ];
  const rows = [];
  for (const c of cases) {
    const started = performance.now();
    try {
      const result = await generateText({ model, tools,
        prompt: c.prompt, toolChoice: { type: "tool", toolName: c.tool },
        maxOutputTokens: 300, maxRetries: 0, abortSignal: AbortSignal.timeout(45000) });
      const call = result.toolCalls.find((t) => t.toolName === c.tool);
      const schemaValid = call ? MODEL_CLIENT_TOOLS[c.tool].inputSchema.safeParse(call.input).success : false;
      const input = call?.input as { query?: string; kind?: string; weeks?: number; actions?: { do?: string; venue?: number }[] } | undefined;
      const parametersCorrect = schemaValid && (c.tool === "find" ? input?.query === "Alpha Club" && input?.kind === "venue"
        : c.tool === "what_if" ? input?.weeks === 4 && input?.actions?.length === 1 && input.actions[0].do === "close_venue" && input.actions[0].venue === 0 : true);
      rows.push({ case: c.name, status: parametersCorrect ? "pass" : "schema_or_parameter_failure", ms: Math.round(performance.now() - started), usage: result.usage, finish: result.finishReason });
    } catch (error) {
      const status = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : undefined;
      const body = error && typeof error === "object" && "responseBody" in error && typeof error.responseBody === "string" ? error.responseBody : "";
      const failureCategory = /tool_use_failed|failed to call a function/i.test(body) ? "tool_generation_failed" : /schema|parameters/i.test(body) ? "request_schema_rejected" : "unclassified";
      rows.push({ case: c.name, status: status === 429 ? "rate_limited" : "request_failed", httpStatus: status, failureCategory, ms: Math.round(performance.now() - started) });
      break; // Do not spend more quota after a failed request.
    }
  }
  const report = { provider: provider.name, model: modelId, requests: rows.length, rows,
    limitations: "Forced-tool, non-streaming synthetic schema compatibility only. No autonomous selection, tool execution, grounded answer, multi-round stream, sustained load or provider reliability validation." };
  await mkdir(".cache/spikes/providers", { recursive: true });
  await writeFile(`.cache/spikes/providers/${provider.name}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch(() => { console.error("Provider probe stopped; no credential/error payload logged."); process.exitCode = 1; });
