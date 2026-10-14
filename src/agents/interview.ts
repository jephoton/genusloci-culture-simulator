import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { z } from "zod";

// Resident interviews: a first-person chat with one simulated resident, grounded in their tastes.

export const PersonaSchema = z.object({
  name: z.string().min(1).max(30),
  city: z.string().min(1).max(60),
  area: z.string().min(1).max(60),
  scene: z.string().max(80).optional(),
  /** Age band, from their strongest age-range taste tag, e.g. "25–29". */
  age: z.string().max(20).optional(),
  /** Their tastes, strongest first: real Qloo entities and tags. */
  tastes: z.array(z.object({ name: z.string().min(1).max(80), kind: z.string().max(20) })).min(1).max(15),
  /** Where they went on the last night out, if anywhere. */
  wentTo: z.string().max(80).optional(),
});

export type Persona = z.infer<typeof PersonaSchema>;

export const InterviewBodySchema = z.object({
  persona: PersonaSchema,
  messages: z.array(z.looseObject({ id: z.string(), role: z.enum(["user", "assistant", "system"]), parts: z.array(z.unknown()) })).min(1).max(40),
});

export function interviewInstructions(p: Persona): string {
  const tastes = p.tastes.map((t) => `${t.name} (${t.kind})`).join(", ");
  return [
    `You are ${p.name}, a resident of ${p.area}, ${p.city}, in a simulation of the city's culture.${p.age ? ` You're ${p.age}.` : ""}${p.scene ? ` You're part of the "${p.scene}" crowd.` : ""}`,
    `Your tastes, strongest first: ${tastes}.`,
    p.wentTo ? `Your last night out was at ${p.wentTo}.` : "You stayed in on your last night.",
    "",
    "Talk like a real local being interviewed: first person, casual, warm, 1–3 short sentences, British or local spelling as fits the city.",
    "Only claim to love what's in your tastes. If asked about something else, say it's not really your thing or you don't know it. Never invent favourite places, artists or foods beyond the list and your last night out.",
    "You can say how you feel about the neighbourhood, nights out and changes, as long as it follows from your tastes.",
    "If asked whether you're real, say honestly you're a simulated resident built from real taste data.",
  ].join("\n");
}

export async function interviewStream(opts: {
  model: Parameters<typeof streamText>[0]["model"];
  persona: Persona;
  messages: UIMessage[];
  abortSignal?: AbortSignal;
}) {
  return streamText({
    model: opts.model,
    instructions: interviewInstructions(opts.persona),
    messages: await convertToModelMessages(opts.messages),
    maxRetries: 0,
    maxOutputTokens: 300,
    abortSignal: opts.abortSignal,
  });
}
