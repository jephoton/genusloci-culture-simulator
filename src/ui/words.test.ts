import { describe, expect, it } from "vitest";
import { areaName, dayLabel, kindWord, weekAndDay } from "@/ui/words";

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

describe("dayLabel", () => {
  it("names the week and weekday with daily ticks (Monday is day 0)", () => {
    expect(dayLabel(0, 7)).toBe("Week 0 · Mon");
    expect(dayLabel(25, 7)).toBe("Week 3 · Fri");
    expect(dayLabel(27, 7)).toBe("Week 3 · Sun");
    expect(dayLabel(28, 7)).toBe("Week 4 · Mon");
  });

  it("is just the week with weekly (or other) tick lengths", () => {
    expect(dayLabel(3, 1)).toBe("Week 3");
    expect(dayLabel(5, 2)).toBe("Week 2");
  });
});

describe("weekAndDay", () => {
  it("splits a tick into its week and weekday name", () => {
    expect(weekAndDay(25, 7)).toEqual({ week: 3, day: "Fri" });
    expect(weekAndDay(25, 1)).toEqual({ week: 25, day: null });
  });
});
