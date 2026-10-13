import type { CrossRef } from "../types";
import { parseOsisRange } from "./refs";

// OpenBible.info's cross references: a tab-separated file with a header line
// and one reference per line,
//
//   Gen.1.1 <tab> John.1.1-John.1.3 <tab> 281
//
// from a verse, to a verse or range, with the votes its readers have given
// the pairing. Votes can be negative.

export type SkippedLine = { line: number; text: string; reason: string };

export function parseCrossReferences(tsv: string): {
  rows: CrossRef[];
  skipped: SkippedLine[];
} {
  const rows = new Map<string, CrossRef>();
  const skipped: SkippedLine[] = [];
  tsv.split(/\r?\n/).forEach((text, i) => {
    // The header, and the blank line at the end.
    if (i === 0 || !text.trim()) return;
    const skip = (reason: string) => skipped.push({ line: i + 1, text, reason });

    const [from, to, votes] = text.split("\t");
    const source = parseOsisRange(from ?? "");
    const target = parseOsisRange(to ?? "");
    if (!/^-?\d+$/.test(votes?.trim() ?? "")) return skip("no vote count");
    if (!source || source.start !== source.end) return skip("not from a verse of the canon");
    if (!target) return skip("not to verses of the canon");

    const row = {
      fromVerse: source.start,
      toStart: target.start,
      toEnd: target.end,
      votes: Number(votes),
    };
    const key = `${row.fromVerse}:${row.toStart}:${row.toEnd}`;
    // The same pairing twice: keep the better-voted line.
    const seen = rows.get(key);
    if (!seen || seen.votes < row.votes) rows.set(key, row);
  });
  return { rows: [...rows.values()], skipped };
}
