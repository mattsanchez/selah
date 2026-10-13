// First boot: the ordered list of things an install loads before it is
// complete (the Bible translations; later cross references and commentary).
// The steps run one after another in their own process, beside the app, and
// record their progress so the app can show it. The list itself is in
// scripts/first-boot-steps.ts.

export type BootStepStatus = "pending" | "running" | "done" | "failed";

export type BootStep = {
  // Stable id, e.g. "bible:bsb". The row in `boot_step`.
  id: string;
  // Shown on the status page, e.g. "Berean Standard Bible".
  title: string;
  // What this step loads, e.g. the pinned checksum. A step that is done is
  // skipped on the next start unless this has changed.
  version: string;
  // Must be idempotent: it runs again after a failure or an interrupted start.
  // Throw a FirstBootError to choose what the status page says. May return a
  // note for the status page, such as where the files were downloaded from.
  run(context: { log: (message: string) => void }): Promise<string | void>;
};

export type BootStepRow = {
  id: string;
  position: number;
  title: string;
  status: BootStepStatus;
  version: string;
  message: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  heartbeatAt: Date | null;
};

// An error whose message is written for the person installing Selah: it says
// what failed, which source was involved and how to retry.
export class FirstBootError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FirstBootError";
  }
}

export const RETRY_HINT =
  "Restart Selah to try again (with Docker: `docker compose restart app`). " +
  "Steps that already finished are not repeated.";

// Where progress is kept. The database implementation is in ./store.ts.
export type BootStepStore = {
  list(): Promise<BootStepRow[]>;
  // Makes the rows match `steps` (in order): every step that is not listed in
  // `keepDone` becomes pending, and rows of steps no longer in the list go.
  register(steps: readonly BootStep[], keepDone: readonly string[]): Promise<void>;
  start(id: string): Promise<void>;
  finish(id: string, note?: string): Promise<void>;
  fail(id: string, message: string): Promise<void>;
  // Marks every unfinished step as still being worked on.
  heartbeat(): Promise<void>;
};

export type FirstBootResult = { done: string[]; skipped: string[]; failed: string[] };

export function failureMessage(error: unknown): string {
  if (error instanceof FirstBootError) return error.message;
  const reason = error instanceof Error ? error.message : String(error);
  return `${reason}\n${RETRY_HINT}`;
}

// Runs every step that is not already done at its current version, in order.
// A failed step is recorded and the rest still run: one source being down
// must not keep the others from loading.
export async function runFirstBoot(
  steps: readonly BootStep[],
  store: BootStepStore,
  {
    log = console.log,
    heartbeatMs = 10_000,
  }: { log?: (message: string) => void; heartbeatMs?: number } = {},
): Promise<FirstBootResult> {
  const ids = new Set<string>();
  for (const step of steps) {
    if (ids.has(step.id)) throw new Error(`Two first-boot steps share the id "${step.id}"`);
    ids.add(step.id);
  }

  const before = new Map((await store.list()).map((row) => [row.id, row]));
  const skipped = steps
    .filter((step) => {
      const row = before.get(step.id);
      return row?.status === "done" && row.version === step.version;
    })
    .map((step) => step.id);
  await store.register(steps, skipped);

  const result: FirstBootResult = { done: [], skipped, failed: [] };
  const beat = setInterval(() => void store.heartbeat().catch(() => {}), heartbeatMs);
  try {
    for (const step of steps) {
      if (skipped.includes(step.id)) {
        log(`first boot: ${step.title}: already done`);
        continue;
      }
      log(`first boot: ${step.title}: starting`);
      await store.start(step.id);
      try {
        const note = await step.run({ log: (message) => log(`first boot: ${message}`) });
        await store.finish(step.id, note || undefined);
        result.done.push(step.id);
        log(`first boot: ${step.title}: done`);
      } catch (error) {
        const message = failureMessage(error);
        await store.fail(step.id, message);
        result.failed.push(step.id);
        log(`first boot: ${step.title}: FAILED\n${message}`);
      }
    }
  } finally {
    clearInterval(beat);
  }
  return result;
}
