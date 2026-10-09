import { SimHost } from "@/sim/worker/host";
import type { WorkerRequest } from "@/sim/worker/protocol";

// Web Worker entry: one SimHost per worker. Requests get exactly one response; while playing, frames
// are pushed with their typed arrays transferred (not copied).
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};
const host = new SimHost({
  emit: (message, transfer) => scope.postMessage(message, transfer),
  schedule: (fn, ms) => setTimeout(fn, ms),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
});
scope.onmessage = (e) => scope.postMessage(host.handle(e.data));
