import { SimHost } from "@/sim/worker/host";
import type { WorkerRequest } from "@/sim/worker/protocol";

// Web Worker entry: one SimHost per worker; every request gets exactly one response.
const host = new SimHost();
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: unknown): void;
};
scope.onmessage = (e) => scope.postMessage(host.handle(e.data));
