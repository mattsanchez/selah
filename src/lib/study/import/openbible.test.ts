import { describe, expect, it } from "vitest";

import { parseCrossReferences } from "./openbible";

const HEADER = "From Verse\tTo Verse\tVotes\t#www.openbible.info CC-BY 2026-10-12";

describe("parseCrossReferences", () => {
  it("maps every reference to canonical verse ids, with its votes", () => {
    const { rows, skipped } = parseCrossReferences(
      [
        HEADER,
        "John.3.16\tRom.5.8\t986",
        "John.3.16\t1John.4.9-1John.4.10\t700",
        "Gen.14.18\tHeb.6.20-Heb.7.3\t18",
        "Ps.23.1\tJohn.10.11\t-3",
        "",
      ].join("\n"),
    );
    expect(skipped).toEqual([]);
    expect(rows).toEqual([
      { fromVerse: 43003016, toStart: 45005008, toEnd: 45005008, votes: 986 },
      { fromVerse: 43003016, toStart: 62004009, toEnd: 62004010, votes: 700 },
      { fromVerse: 1014018, toStart: 58006020, toEnd: 58007003, votes: 18 },
      { fromVerse: 19023001, toStart: 43010011, toEnd: 43010011, votes: -3 },
    ]);
  });

  it("reads Windows line ends and keeps one line for a pairing given twice", () => {
    const { rows } = parseCrossReferences(
      [HEADER, "John.3.16\tRom.5.8\t5", "John.3.16\tRom.5.8\t9"].join("\r\n"),
    );
    expect(rows).toEqual([{ fromVerse: 43003016, toStart: 45005008, toEnd: 45005008, votes: 9 }]);
  });

  it("skips, and reports, a line it cannot map", () => {
    const { rows, skipped } = parseCrossReferences(
      [
        HEADER,
        "Tob.1.1\tRom.5.8\t5",
        "John.3.16\tRom.5.99\t5",
        "John.3.16\tRom.5.8\tmany",
        "John.3.16-John.3.17\tRom.5.8\t5",
        "John.3.16\tRom.5.8",
      ].join("\n"),
    );
    expect(rows).toEqual([]);
    expect(skipped.map(({ line, reason }) => [line, reason])).toEqual([
      [2, "not from a verse of the canon"],
      [3, "not to verses of the canon"],
      [4, "no vote count"],
      [5, "not from a verse of the canon"],
      [6, "no vote count"],
    ]);
  });
});
