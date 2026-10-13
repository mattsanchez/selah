import type { BootStepRow } from "./runner";

// What the app shows about first boot, worked out from the `boot_step` rows.

// "none": nothing recorded (a development database loaded by the seed).
// "running": steps are being worked on. "stalled": steps are unfinished but
// nothing has touched them lately, so the process running them has died.
// "failed": all steps ended and at least one failed. "done": all succeeded.
export type FirstBootState = "none" | "running" | "stalled" | "failed" | "done";

export type FirstBootStatus = {
  state: FirstBootState;
  steps: Pick<BootStepRow, "id" | "title" | "status" | "message">[];
};

// The runner touches unfinished steps every 10 seconds; a step can block it
// for a while (parsing a whole Bible), so allow a generous gap.
export const STALLED_AFTER_MS = 3 * 60_000;

export function summarizeFirstBoot(
  rows: readonly BootStepRow[],
  now: Date = new Date(),
): FirstBootStatus {
  const ordered = [...rows].sort((a, b) => a.position - b.position);
  const steps = ordered.map(({ id, title, status, message }) => ({ id, title, status, message }));
  if (ordered.length === 0) return { state: "none", steps };

  const unfinished = ordered.filter((row) => row.status === "pending" || row.status === "running");
  if (unfinished.length > 0) {
    const alive = unfinished.some(
      (row) =>
        row.heartbeatAt !== null &&
        now.getTime() - row.heartbeatAt.getTime() < STALLED_AFTER_MS,
    );
    return { state: alive ? "running" : "stalled", steps };
  }
  return {
    state: ordered.some((row) => row.status === "failed") ? "failed" : "done",
    steps,
  };
}
