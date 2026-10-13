import {
  ChecksumError,
  describeSource,
  DownloadError,
  isRetryable,
  SourcesFailedError,
  type Origin,
  type SourceFailure,
} from "@/lib/bible/import/download";
import { StudyChecksumError } from "@/lib/study/import/download";

import { FirstBootError, RETRY_HINT } from "./runner";

// Helpers for first-boot steps that download a pinned file.

const ISSUES_URL = "https://github.com/mattsanchez/selah/issues";

// How many times a download is tried before the step fails, and how long to
// wait between tries.
const DOWNLOAD_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;

const changed = (error: unknown): error is ChecksumError | StudyChecksumError =>
  error instanceof ChecksumError || error instanceof StudyChecksumError;

const hostOf = (url: string) => new URL(url).host;

// A file that was asked for in more than one place (Selah's mirror, then the
// publisher) and came from none: says what happened at each, then what to do.
function describeSourcesFailure(what: string, failures: readonly SourceFailure[]): string {
  const tried = failures.map((failure) => {
    const { error, url } = failure;
    const where = failure.mirror ? `Selah's mirror (${hostOf(url)})` : `the publisher (${hostOf(url)})`;
    if (error instanceof DownloadError) return `- ${where}: could not download ${url} (${error.reason}).`;
    if (changed(error)) {
      return failure.mirror
        ? `- ${where}: the copy at ${url} is not the file this version of Selah was released with.`
        : `- ${where}: the file at ${url} has changed since this version of Selah was released.`;
    }
    return `- ${where}: ${error.message}`;
  });
  const unreachable = failures.filter(({ error }) => error instanceof DownloadError);
  const upstreamChanged = failures.some((failure) => !failure.mirror && changed(failure.error));

  let advice: string;
  if (unreachable.length === 0) {
    advice =
      "Selah only loads files that match the checksums it was released with, so trying again will not help. " +
      `Upgrade Selah if a newer version exists, or report it at ${ISSUES_URL}. ` +
      "Everything that did load keeps working.";
  } else {
    const hosts = unreachable.map(({ url }) => hostOf(url)).join(" or ");
    advice =
      (upstreamChanged
        ? "The publisher's file has changed, so this version of Selah can only load the mirror's copy. "
        : "") + `Check that this machine can reach ${hosts}. ${RETRY_HINT}`;
  }
  return `${what} was not loaded. It was looked for in ${failures.length} places:\n${tried.join("\n")}\n${advice}`;
}

// Turns an import failure into a message for the person installing Selah.
export function describeImportFailure(what: string, error: unknown): FirstBootError {
  if (error instanceof SourcesFailedError) {
    return new FirstBootError(describeSourcesFailure(what, error.failures), { cause: error });
  }
  if (changed(error)) {
    const host = hostOf(error.url);
    return new FirstBootError(
      `${what} was not loaded: the file at ${error.url} has changed since this version of Selah was released. ` +
        "Selah only loads files that match the checksums it was released with, so trying again will not help. " +
        `Upgrade Selah if a newer version exists, or report it at ${ISSUES_URL} (say that the file from ${host} changed). ` +
        "Everything that did load keeps working.",
      { cause: error },
    );
  }
  if (error instanceof DownloadError) {
    const host = hostOf(error.url);
    return new FirstBootError(
      `${what} was not loaded: could not download ${error.url} (${error.reason}). ` +
        `Check that this machine can reach ${host}. ${RETRY_HINT}`,
      { cause: error },
    );
  }
  const reason = error instanceof Error ? error.message : String(error);
  return new FirstBootError(`${what} was not loaded: ${reason}\n${RETRY_HINT}`, { cause: error });
}

// Where a step's files came from, for the status page: "Downloaded from the
// mirror at github.com." A place that was asked first and failed is named
// too, so a step that fell back to the publisher says so.
export function describeOrigins(origins: readonly Origin[]): string {
  const unique = (values: string[]) => [...new Set(values)];
  const from = unique(origins.flatMap(({ from }) => (from ? [describeSource(from)] : [])));
  if (from.length === 0) return "From files downloaded earlier.";
  const failed = unique(origins.flatMap(({ failures }) => failures.map(describeSource)));
  return (
    `Downloaded from ${from.join(" and ")}.` +
    (failed.length > 0 ? ` Tried ${failed.join(" and ")} first, without success.` : "")
  );
}

// Runs `task`, trying again when a download fails: a host that is briefly
// down should not need a restart. A file that changed everywhere it was
// looked for is not retried.
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
      if (!isRetryable(error) || attempt >= attempts) throw error;
      // Wait a little longer each time.
      const wait = delayMs * attempt;
      const reason = error instanceof Error ? error.message : String(error);
      log(`${reason}; trying again in ${wait / 1000}s (try ${attempt} of ${attempts} failed)`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}
