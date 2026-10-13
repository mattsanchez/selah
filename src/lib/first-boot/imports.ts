import { ChecksumError, DownloadError } from "@/lib/bible/import/download";

import { FirstBootError, RETRY_HINT } from "./runner";

// Helpers for first-boot steps that download a pinned file.

const ISSUES_URL = "https://github.com/mattsanchez/selah/issues";

// How many times a download is tried before the step fails, and how long to
// wait between tries.
const DOWNLOAD_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;

// Turns an import failure into a message for the person installing Selah.
export function describeImportFailure(what: string, error: unknown): FirstBootError {
  if (error instanceof ChecksumError) {
    const host = new URL(error.url).host;
    return new FirstBootError(
      `${what} was not loaded: the file at ${error.url} has changed since this version of Selah was released. ` +
        "Selah only loads files that match the checksums it was released with, so trying again will not help. " +
        `Upgrade Selah if a newer version exists, or report it at ${ISSUES_URL} (say that the file from ${host} changed). ` +
        "Everything that did load keeps working.",
      { cause: error },
    );
  }
  if (error instanceof DownloadError) {
    const host = new URL(error.url).host;
    return new FirstBootError(
      `${what} was not loaded: could not download ${error.url} (${error.reason}). ` +
        `Check that this machine can reach ${host}. ${RETRY_HINT}`,
      { cause: error },
    );
  }
  const reason = error instanceof Error ? error.message : String(error);
  return new FirstBootError(`${what} was not loaded: ${reason}\n${RETRY_HINT}`, { cause: error });
}

// Runs `task`, trying again when a download fails: a host that is briefly
// down should not need a restart. A changed file is not retried.
export async function withDownloadRetries<T>(
  task: () => Promise<T>,
  {
    attempts = DOWNLOAD_ATTEMPTS,
    delayMs = RETRY_DELAY_MS,
    log = console.log,
  }: { attempts?: number; delayMs?: number; log?: (message: string) => void } = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await task();
    } catch (error) {
      if (!(error instanceof DownloadError) || attempt >= attempts) throw error;
      // Wait a little longer each time.
      const wait = delayMs * attempt;
      log(`${error.message}; trying again in ${wait / 1000}s (try ${attempt} of ${attempts} failed)`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}
