import { describe, expect, it } from "vitest";
import { areaName, kindWord } from "@/ui/words";

const layout = { center: { x: 0, z: 0 }, bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 } };

describe("areaName", () => {
  it("names the centre and the compass directions (x east, z south)", () => {
    expect(areaName(layout, 5, -5)).toBe("the city centre");
    expect(areaName(layout, 0, -80)).toBe("the north");
    expect(areaName(layout, 80, 0)).toBe("the east");
    expect(areaName(layout, 0, 80)).toBe("the south");
    expect(areaName(layout, -80, 0)).toBe("the west");
    expect(areaName(layout, 60, -60)).toBe("the north-east");
    expect(areaName(layout, -60, 60)).toBe("the south-west");
  });
});

describe("kindWord", () => {
  it("gives plain lower-case names", () => {
    expect(kindWord("music_venue")).toBe("music venue");
    expect(kindWord("cafe")).toBe("café");
    expect(kindWord("other")).toBe("venue");
  });
});
