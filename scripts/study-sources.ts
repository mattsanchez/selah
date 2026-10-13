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

const verified = (source: StudyDownload, cached: boolean) =>
  `${source.name}: ${cached ? "cached" : "downloaded"}, checksum ${source.contentSha256.slice(0, 12)}… verified`;

export async function fetchCrossReferenceRows() {
  const { rows, skipped, cached } = await fetchCrossReferences(CROSS_REFERENCES);
  console.log(verified(CROSS_REFERENCES, cached));
  if (skipped.length > 0) {
    console.log(
      `${CROSS_REFERENCES.name}: ${skipped.length} lines skipped: ` +
        skipped.map(({ text, reason }) => `"${text}" (${reason})`).join(", "),
    );
  }
  return rows;
}

export async function fetchCommentaryRecords(source: CommentarySource) {
  const { records, skipped, cached } = await fetchCommentary(source);
  console.log(verified(source, cached));
  if (skipped.length > 0) {
    console.log(`${source.name}: ${skipped.length} notes skipped: ${skipped.join(", ")}`);
  }
  return records;
}
