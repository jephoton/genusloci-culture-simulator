import { expect, it, vi } from "vitest";
const { artist, similar, loadWorldJson } = vi.hoisted(() => ({ artist: { id: "tour", name: "Tour", tags: [] }, similar: [{ id: "local", name: "Local", tags: [] }], loadWorldJson: vi.fn() }));
vi.mock("@/agents/qloo-live", () => ({ liveQlooClient: () => ({ search: async () => [artist], recommend: async () => similar, tagAffinities: async () => [] }) }));
vi.mock("@/world/store", () => ({ loadWorldJson }));
import { POST } from "./route";
it("returns stable Qloo IDs without consulting a mutable slug world cache", async () => {
  const response = await POST(new Request("http://localhost/api/outside-act", { method: "POST", body: JSON.stringify({ city: "london", name: "Tour" }) }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ evidence: { artist, similar, tags: [] } });
  expect(loadWorldJson).not.toHaveBeenCalled();
});
