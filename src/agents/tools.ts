import { z } from "zod";
import { VENUE_KINDS } from "@/world/schema";

// Co-pilot tool inputs, shared by the server route (which declares the tools) and the browser (which
// runs the city tools against the simulation worker). No server-only imports here.

const id = z.number().int().nonnegative();

export const AreaSchema = z
  .object({
    near_venue: id.optional().describe("A venue id from find/venue: the area around that venue"),
    name: z.string().min(1).optional().describe('A neighbourhood name from find (kind "area"), e.g. "Soho"'),
  })
  .refine((a) => a.near_venue !== undefined || a.name !== undefined, "give near_venue or name");

export const CopilotActionSchema = z.discriminatedUnion("do", [
  z.object({ do: z.literal("close_venue"), venue: id.describe("Venue id") }),
  z.object({ do: z.literal("cancel_event"), event: id.describe("Booking id from event_calendar") }),
  z.object({
    do: z.literal("open_venue"),
    kind: z.enum(VENUE_KINDS),
    area: AreaSchema,
    place: id.optional().describe("A specific real place id (from find, kind place) to open; else the best fit of that kind"),
  }),
  z.object({
    do: z.literal("throw_event"),
    artist: id.optional().describe("Artist id from find or city_summary (an artist already in this city)"),
    outside_artist: z
      .string()
      .min(1)
      .max(80)
      .optional()
      .describe("Name of an artist NOT in this city: Qloo is asked live who their fans are, and the event gets that crowd's taste"),
    area: AreaSchema,
    weeks: z.number().int().min(1).max(8).optional().describe("How many weeks it runs (default 3)"),
    start_tick: id.optional().describe("Absolute simulation day/tick from city_summary; omitted means now"),
    nights: z.number().int().min(1).max(28).optional().describe("Exact nights in daily mode, overrides weeks"),
  }),
  z.object({
    do: z.literal("rent_pressure"),
    area: AreaSchema,
    magnitude: z.number().min(0.1).max(2).describe("Rent rise as a fraction: 0.5 = +50%"),
  }),
  z.object({
    do: z.literal("migrate"),
    count: z.number().int().min(10).max(1000),
    area: AreaSchema,
    like_scene: id.describe("Scene id whose taste the newcomers share"),
  }),
]);

export type Area = z.infer<typeof AreaSchema>;
export type CopilotAction = z.infer<typeof CopilotActionSchema>;

/** Tools the browser executes (the simulation lives there). Descriptions are written for the model. */
export const CLIENT_TOOLS = {
  event_calendar: {
    description: "List booked events, simulation start ticks, status and any start failures. Use ids to cancel bookings.",
    inputSchema: z.object({}),
  },
  city_summary: {
    description:
      "The city right now: date, residents, venue counts, fidelity, every scene (id, size, name, top tastes, home areas) and recent changes. Call this first.",
    inputSchema: z.object({}),
  },
  find: {
    description:
      "Find venues, openable places, artists, taste tags or neighbourhoods in this city by name. Returns ids to use with the other tools.",
    inputSchema: z.object({
      query: z.string().min(1),
      kind: z.enum(["venue", "place", "artist", "tag", "area", "any"]).optional(),
    }),
  },
  venues: {
    description:
      "List venues, optionally of one kind or in one neighbourhood, ranked by how busy they are (estimated weekly visits) or by how much they are struggling (lowest health first; below 0.4 for weeks means closure).",
    inputSchema: z.object({
      kind: z.enum(VENUE_KINDS).optional(),
      area: z.string().optional().describe("Neighbourhood name"),
      sort: z.enum(["busiest", "struggling"]).optional(),
      limit: z.number().int().min(1).max(10).optional(),
    }),
  },
  venue: {
    description: "One venue: kind, area, open or closed, health, tonight's visitors and which scenes they come from, its taste tags.",
    inputSchema: z.object({ venue: id }),
  },
  scene: {
    description: "One scene: size, name, top tastes, where its members live and which venues they go to.",
    inputSchema: z.object({ scene: id }),
  },
  what_if: {
    description:
      "Simulate actions on a copy of the city for some weeks, next to a copy with no actions, and compare: scene sizes, venues that close or open, venues that gain or lose visits, new fans of an event's headliner. The live city is NOT changed. Use this before claiming any effect.",
    inputSchema: z.object({
      actions: z.array(CopilotActionSchema).min(1).max(3),
      weeks: z.number().int().min(1).max(26).optional().describe("Weeks to simulate (default 8)"),
    }),
  },
  apply: {
    description: "Change the LIVE city with these actions. Only when the user explicitly asks you to make the change.",
    inputSchema: z.object({ actions: z.array(CopilotActionSchema).min(1).max(3) }),
  },
} as const;

export type ClientToolName = keyof typeof CLIENT_TOOLS;
export const CLIENT_TOOL_NAMES = Object.keys(CLIENT_TOOLS) as ClientToolName[];
