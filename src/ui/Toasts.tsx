import type { XZ } from "@/render/layout";

export type Toast = { id: number; message: string; anchor?: XZ };

/** Short notices, newest last, top-centre. A toast with a map anchor flies the camera there when clicked. */
export function Toasts({ toasts, onSelect }: { toasts: Toast[]; onSelect?: (toast: Toast) => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none absolute left-1/2 top-[7.5rem] flex sm:top-20 w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 flex-col items-center gap-2"
    >
      {toasts.map((t) =>
        t.anchor && onSelect ? (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t)}
            title="Show me"
            className="panel pointer-events-auto px-4 py-2 text-sm text-zinc-100 hover:bg-white/10"
          >
            {t.message}
            <span className="ml-2 text-xs text-violet-300">Show me</span>
          </button>
        ) : (
          <p key={t.id} className="panel px-4 py-2 text-sm text-zinc-100">
            {t.message}
          </p>
        ),
      )}
    </div>
  );
}
