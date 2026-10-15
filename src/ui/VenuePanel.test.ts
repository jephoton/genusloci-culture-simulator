import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VenuePanel } from "@/ui/VenuePanel";
import { initState } from "@/sim/state";
import { DEFAULT_CONFIG } from "@/sim/config";
import { recordClosure } from "@/sim/closures";
import { buildFrame } from "@/sim/frame";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";
import { step } from "@/sim/step";

it("shows an outside act's booked name instead of its taste proxy", () => {
 const world = makeTinyWorld();
 const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 10 }, 1);
 const [r] = step(s, [{ type: "scheduleEvent", entity: 5, cell: 0, duration: 1, capacity: 100, reachKm: 1, label: "Outside Test Act" }]);
 if (!r.ok) throw new Error(r.error);
 const { frame } = buildFrame(s, "main", 0, false, 0);
 const html = renderToStaticMarkup(createElement(VenuePanel, { world, frame, slot: r.venue!, onCloseVenue: () => {}, onDismiss: () => {} }));
 expect(html).toContain("Outside Test Act");
});

it("shows closure evidence and actual weekly visits in venue inspection", () => {
 const world = makeTinyWorld();
 const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 10 }, 1);
 s.venueWeekVisits[0] = 17;
 recordClosure(s, 0, "poor_health");
 const { frame } = buildFrame(s, "main", 0, false, 0);
 const html = renderToStaticMarkup(createElement(VenuePanel, { world, frame, slot: 0, onCloseVenue: () => {}, onDismiss: () => {} }));
 expect(html).toContain("17 visits");
 expect(html).toContain("Rolling weekly visits");
 expect(html).toContain("Rent multiplier");
});
