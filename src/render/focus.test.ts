import { describe, expect, it } from "vitest";
import { agentInFocus, venueInFocus } from "@/render/focus";

describe("focus", () => {
  it("keeps everyone in focus when nothing is focused", () => {
    expect(agentInFocus(null, 3, -1)).toBe(true);
    expect(venueInFocus(null, { slot: 2, dominantScene: -1 })).toBe(true);
  });

  it("follows a scene's members and the venues it dominates", () => {
    const focus = { kind: "scene", id: 4 } as const;
    expect(agentInFocus(focus, 4, -1)).toBe(true);
    expect(agentInFocus(focus, 5, 2)).toBe(false);
    expect(venueInFocus(focus, { slot: 0, dominantScene: 4 })).toBe(true);
    expect(venueInFocus(focus, { slot: 1, dominantScene: 5 })).toBe(false);
  });

  it("follows a venue and its visitors this week", () => {
    const focus = { kind: "venue", slot: 2 } as const;
    expect(agentInFocus(focus, 9, 2)).toBe(true);
    expect(agentInFocus(focus, 9, 3)).toBe(false);
    expect(venueInFocus(focus, { slot: 2, dominantScene: 7 })).toBe(true);
    expect(venueInFocus(focus, { slot: 3, dominantScene: 7 })).toBe(false);
  });
});
