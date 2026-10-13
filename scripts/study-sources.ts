import { describeOrigin, type Origin } from "../src/lib/bible/import/download";
import { fetchCommentary, fetchCrossReferences } from "../src/lib/study/import/download";
import {
  COMMENTARY_SOURCES,
  CROSS_REFERENCES,
  type CommentarySource,
  type StudyDownload,
} from "../src/lib/study/sources";

const ALL = [CROSS_REFERENCES, ...COMMENTARY_SOURCES];

// The study sources named on the command line (by id), or all of them.
export function selectStudySources(args: readonly string[]): {
  crossReferences: boolean;
  commentaries: CommentarySource[];
} {
  for (const arg of args) {
    if (!ALL.some((source) => source.id === arg.toLowerCase())) {
      throw new Error(
        `Unknown study source "${arg}". Known: ${ALL.map((s) => s.id).join(", ")}`,
      );
    }
  }
  const wanted = (source: StudyDownload) =>
    args.length === 0 || args.some((arg) => arg.toLowerCase() === source.id);
  return {
    crossReferences: wanted(CROSS_REFERENCES),
    commentaries: COMMENTARY_SOURCES.filter(wanted),
  };
}

const verified = (source: StudyDownload, origin: Origin) =>
  `${source.name}: ${describeOrigin(origin)}, checksum ${source.contentSha256.slice(0, 12)}… verified`;

// Where downloads are kept, where progress is reported and who is told where
// each file came from; first boot keeps downloads in the data directory.
type StudyFetchOptions = {
  cacheDir?: string;
  log?: (message: string) => void;
  used?: (origin: Origin) => void;
};

export async function fetchCrossReferenceRows({
  log = console.log,
  used,
  ...cache
}: StudyFetchOptions = {}) {
  const { rows, skipped, ...origin } = await fetchCrossReferences(CROSS_REFERENCES, cache);
  used?.(origin);
  log(verified(CROSS_REFERENCES, origin));
  if (skipped.length > 0) {
    log(
      `${CROSS_REFERENCES.name}: ${skipped.length} lines skipped: ` +
        skipped.map(({ text, reason }) => `"${text}" (${reason})`).join(", "),
    );
  }
  return rows;
}

export async function fetchCommentaryRecords(
  source: CommentarySource,
  { log = console.log, used, ...cache }: StudyFetchOptions = {},
) {
  const { records, skipped, ...origin } = await fetchCommentary(source, cache);
  used?.(origin);
  log(verified(source, origin));
  if (skipped.length > 0) {
    log(`${source.name}: ${skipped.length} notes skipped: ${skipped.join(", ")}`);
  }
  return records;
}
