import { z } from "zod";

const index = z.number().int().nonnegative();

/** World-changing commands, shared by the god toolbar and the co-pilot. Indices refer to the current World/state. */
export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("closeVenue"), venue: index }),
  z.object({
    type: z.literal("openVenue"),
    entity: index,
    cell: index,
    capacity: z.number().positive().optional(),
  }),
  z.object({
    type: z.literal("scheduleEvent"),
    entity: index,
    cell: index,
    /** Ticks (weeks) the event stays open. */
    duration: z.number().int().min(1).max(52),
    /** Agents whose home is within this distance treat the event as a candidate. */
    reachKm: z.number().positive().max(100),
    capacity: z.number().positive(),
  }),
  z.object({
    type: z.literal("migrate"),
    count: z.number().int().min(1).max(5000),
    cells: z.array(index).min(1),
    /** Taste profile of the arriving population, in this world's entity indices. */
    genes: z.array(z.object({ entity: index, weight: z.number().min(0).max(1) })).min(1),
  }),
  z.object({
    type: z.literal("rentPressure"),
    cells: z.array(index).min(1),
    /** Rent multiplier increase: rent ← rent × (1 + magnitude). */
    magnitude: z.number().positive().max(4),
  }),
]);

export type Action = z.infer<typeof ActionSchema>;
export type ActionLogEntry = { tick: number; action: Action };
export type ActionResult =
  | { ok: true; venue?: number; agents?: number }
  | { ok: false; error: string };

export function parseAction(json: unknown): Action {
  return ActionSchema.parse(json);
}
