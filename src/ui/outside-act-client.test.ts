import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOutsideAct } from "@/ui/outside-act-client";

const entity = (id: string) => ({ id, name: id, type: "artist" as const, tags: [], popularity: 0.5 });
const evidence = { artist: { id: "touring", name: "Touring", tags: [] }, similar: [{ id: "local", name: "Local", tags: [] }], tags: [] };
afterEach(() => vi.unstubAllGlobals());
describe("outside act world boundary", () => {
  it("resolves stable IDs against each client's own entity order after a rebuild", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ evidence })));
    const old = await fetchOutsideAct("london", "Touring", { entities: [entity("local"), entity("other")] });
    const rebuilt = await fetchOutsideAct("london", "Touring", { entities: [entity("other"), entity("local")] });
    expect(old).toMatchObject({ proxy: 0, profile: [{ entity: 0, weight: 0.9 }] });
    expect(rebuilt).toMatchObject({ proxy: 1, profile: [{ entity: 1, weight: 0.9 }] });
  });
  it("rejects connections absent from the caller's world and legacy numeric responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ evidence })));
    expect(await fetchOutsideAct("london", "Touring", { entities: [entity("other")] })).toHaveProperty("error");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ act: { proxy: 0, profile: [{ entity: 0, weight: 1 }] } })));
    expect(await fetchOutsideAct("london", "Touring", { entities: [entity("local")] })).toHaveProperty("error");
  });
});
