import { mkdir, writeFile } from "node:fs/promises";
import type { UIMessage } from "ai";
import { copilotStream } from "../src/agents/copilot";
import { PROVIDERS } from "../src/agents/providers";

// Explicit live opt-in; two streamed calls maximum. Synthetic city evidence only,
// no Qloo, actual worker, fallback, retries or live mutations.
try { process.loadEnvFile(".env.local"); } catch { /* use existing environment */ }

async function main() {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!process.argv.includes("--live") || !key) {
    console.log(JSON.stringify({ configured: Boolean(key), requests: 0, live: false }));
    return;
  }
  const model = PROVIDERS.find((p) => p.name === "gemini")!.create(key, "gemini-3.5-flash-lite");
  const messages: UIMessage[] = [{ id: "probe-user", role: "user", parts: [{ type: "text", text: "How many residents live here right now? Use current city facts." }] }];
  const started = performance.now();
  const first = await copilotStream({ model, messages, city: "Synthetic test city", qloo: null, abortSignal: AbortSignal.timeout(45000) });
  let assistant: UIMessage | undefined;
  const reader = first.toUIMessageStream({ onFinish: ({ responseMessage }) => { assistant = responseMessage; } }).getReader();
  while (!(await reader.read()).done) { /* consume stream without logging content */ }
  const calls = await first.toolCalls;
  if (!assistant || calls.length !== 1 || calls[0]?.toolName !== "city_summary") throw new Error("Unexpected tool selection.");
  // Preserve streamed tool metadata (including provider signatures) as the UI does.
  assistant.parts = assistant.parts.map((part) => part.type === "tool-city_summary" ? {
    ...part, state: "output-available", output: { city: "Synthetic test city", residents: 600, tick: 7, week: 1, scenes: [], venues: { open: 10, closed: 0 } },
  } as typeof part : part);
  messages.push(assistant);
  const second = await copilotStream({ model, messages, city: "Synthetic test city", qloo: null, abortSignal: AbortSignal.timeout(45000) });
  const answer = await second.text;
  const extraCalls = await second.toolCalls;
  const report = { provider: "gemini", model: "gemini-3.5-flash-lite", requests: 2,
    freshSummarySelected: true, answeredFromFixture: /\b600\b/.test(answer), additionalToolCalls: extraCalls.length,
    ms: Math.round(performance.now() - started), firstUsage: await first.totalUsage, secondUsage: await second.totalUsage,
    limitations: "Production copilotStream with synthetic browser tool output, not a real browser/worker/HTTP-route rehearsal or sustained reliability test." };
  await mkdir(".cache/spikes/providers", { recursive: true });
  await writeFile(".cache/spikes/providers/gemini-chat.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch(() => { console.error("Gemini chat probe failed; no credentials or provider error payload logged."); process.exitCode = 1; });
