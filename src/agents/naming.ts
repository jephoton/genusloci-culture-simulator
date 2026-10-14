import { generateText, Output } from "ai";
import { z } from "zod";

// Scene naming: a cheap model call turns a scene's real Qloo tastes into a short plain name.

export const MAX_SCENES_PER_CALL = 8;

export const SceneToNameSchema = z.object({
  id: z.number().int().nonnegative(),
  tastes: z.array(z.string().min(1).max(80)).min(1).max(10),
  homes: z.array(z.string().min(1).max(60)).max(5),
  /** Name of the scene it split from, if any, so children read as related. */
  parent: z.string().max(80).optional(),
});

export const NameScenesBodySchema = z.object({
  city: z.string().min(1).max(60),
  scenes: z.array(SceneToNameSchema).min(1).max(MAX_SCENES_PER_CALL),
  /** Names already in use in this city, to avoid repeats. */
  taken: z.array(z.string().max(80)).max(60).optional(),
});

export type SceneName = { id: number; name: string };

const OutputSchema = z.object({
  scenes: z.array(
    z.object({
      id: z.number().int(),
      name: z.string().describe("2–4 word plain-English name, clear and specific, e.g. 'Late-night grime crowd'"),
    }),
  ),
});

export function namingPrompt(body: z.infer<typeof NameScenesBodySchema>): string {
  const lines = body.scenes.map(
    (s) => `- id ${s.id}: tastes ${s.tastes.join(", ")}; lives in ${s.homes.join(", ") || "all over"}${s.parent ? `; split from "${s.parent}"` : ""}`,
  );
  return [
    `Name these taste scenes in ${body.city}.`,
    "For each: a short plain-English name (2–4 words) a local would recognise, drawn ONLY from its tastes. No puns, no Latin, no made-up words.",
    "Keep names distinct from each other" + (body.taken?.length ? ` and from: ${body.taken.join(", ")}` : "") + ". A scene that split from another should sound related to it.",
    "",
    ...lines,
  ].join("\n");
}

/** Names a batch of scenes; returns only well-formed names for ids that were asked for. */
export async function nameScenes(model: Parameters<typeof generateText>[0]["model"], body: z.infer<typeof NameScenesBodySchema>): Promise<SceneName[]> {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: OutputSchema }),
    prompt: namingPrompt(body),
    maxRetries: 0,
    maxOutputTokens: 800,
  });
  const asked = new Set(body.scenes.map((s) => s.id));
  const clean = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);
  return output.scenes
    .filter((s) => asked.has(s.id) && s.name.trim())
    .map((s) => ({ id: s.id, name: clean(s.name, 40) }));
}
