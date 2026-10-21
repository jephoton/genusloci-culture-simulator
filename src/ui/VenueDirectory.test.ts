import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { VenueDirectory } from "@/ui/VenueDirectory";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";
import { initState } from "@/sim/state";
import { DEFAULT_CONFIG } from "@/sim/config";
import { buildFrame } from "@/sim/frame";
import { step } from "@/sim/step";

it("offers open permanent venues without mixing temporary events into the booking directory", () => {
  const world = makeTinyWorld();
  const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 10 }, 1);
  s.venueOpen[0] = 0;
  const [r] = step(s, [{ type: "scheduleEvent", entity: 5, cell: 0, duration: 3, capacity: 100, reachKm: 1, label: "Temporary Night" }]);
  if (!r.ok) throw new Error(r.error);
  const { frame } = buildFrame(s, "main", 0, false, 0);
  const html = renderToStaticMarkup(createElement(VenueDirectory, { world, frame, onSelect: () => {} }));
  expect(html).toContain("Choose a venue");
  expect(html).toContain("Find a venue");
  expect(html).not.toContain("Temporary Night");
  expect(html).not.toContain(`>${world.entities[frame.venueEntity[0]].name}</span>`);
  expect(html).toContain(world.entities[frame.venueEntity[1]].name);
});

it("explains that the city is loading rather than offering an empty booking list", () => {
  const html = renderToStaticMarkup(createElement(VenueDirectory, { world: makeTinyWorld(), frame: null, onSelect: () => {} }));
  expect(html).toContain("Loading venues");
});
