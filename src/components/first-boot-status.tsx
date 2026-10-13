import type { FirstBootStatus } from "@/lib/first-boot/status";

const LABEL = {
  pending: "Waiting",
  running: "Loading…",
  done: "Loaded",
  failed: "Failed",
} as const;

const TONE = {
  pending: "text-stone-500 dark:text-stone-400",
  running: "text-sky-700 dark:text-sky-400",
  done: "text-emerald-700 dark:text-emerald-400",
  failed: "text-red-700 dark:text-red-400",
} as const;

// The first-boot steps, each with its state and, when it failed, why and how
// to retry.
export function FirstBootSteps({ status }: { status: FirstBootStatus }) {
  return (
    <ul className="divide-y divide-stone-200 rounded-md border border-stone-200 dark:divide-stone-800 dark:border-stone-800">
      {status.steps.map((step) => (
        <li key={step.id} data-boot-step={step.id} data-status={step.status} className="px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-4">
            <span>{step.title}</span>
            <span className={`shrink-0 text-sm font-medium ${TONE[step.status]}`}>
              {LABEL[step.status]}
            </span>
          </div>
          {step.status === "failed" && step.message && (
            <p className="mt-1.5 text-sm whitespace-pre-line text-stone-700 dark:text-stone-300">
              {step.message}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

export const STALLED_MESSAGE =
  "Loading stopped before it finished, and nothing is working on it now. " +
  "Restart Selah to pick up where it left off (with Docker: docker compose restart app).";
