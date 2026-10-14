import { describe, expect, it } from "vitest";
import { interviewInstructions, PersonaSchema } from "@/agents/interview";

describe("interview persona", () => {
  const persona = PersonaSchema.parse({
    name: "Sam",
    city: "London",
    area: "Soho",
    scene: "Grime friend groups",
    tastes: [{ name: "Ghetts", kind: "artist" }, { name: "Night club", kind: "tag" }],
    wentTo: "Heaven",
  });

  it("grounds the resident in their tastes, home and last night out", () => {
    const p = interviewInstructions(persona);
    for (const s of ["Sam", "Soho, London", "Grime friend groups", "Ghetts (artist)", "Heaven", "Never invent"]) expect(p).toContain(s);
  });

  it("rejects personas without tastes", () => {
    expect(() => PersonaSchema.parse({ ...persona, tastes: [] })).toThrow();
  });
});
