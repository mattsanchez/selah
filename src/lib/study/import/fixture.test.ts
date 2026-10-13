import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { readFixture } from "@/lib/bible/import/fixture";

import { sanitizeStudyHtml, studyText } from "../html";
import { COMMENTARY_SOURCES, CROSS_REFERENCES, FIXTURE_PASSAGES } from "../sources";
import {
  fixtureCommentary,
  fixtureCrossReferences,
  readCommentaryFixture,
  readCrossReferenceFixture,
  serializeCommentary,
  serializeCrossReferences,
  studyFixtureUrl,
} from "./fixture";

const inFixture = (verseId: number) =>
  FIXTURE_PASSAGES.some((passage) => verseId >= passage.start && verseId <= passage.end);
const JOHN_3_16 = 43003016;

describe("fixture selection", () => {
  it("keeps the cross references from the fixture's verses, best first", () => {
    const rows = [
      { fromVerse: 43003016, toStart: 43003015, toEnd: 43003015, votes: 5 },
      { fromVerse: 43003015, toStart: 43003016, toEnd: 43003016, votes: 9 },
      { fromVerse: 43003016, toStart: 45005008, toEnd: 45005008, votes: 9 },
    ];
    expect(fixtureCrossReferences(rows, FIXTURE_PASSAGES)).toEqual([rows[2], rows[0]]);
  });

  it("keeps the commentary that covers any of the fixture's verses", () => {
    const records = [
      { verseStart: 43001001, verseEnd: 43021025, html: "<p>book</p>" },
      { verseStart: 43003001, verseEnd: 43003015, html: "<p>before</p>" },
      { verseStart: 43003014, verseEnd: 43003016, html: "<p>overlaps</p>" },
      { verseStart: 43003022, verseEnd: 43003036, html: "<p>after</p>" },
    ];
    expect(fixtureCommentary(records, FIXTURE_PASSAGES)).toEqual([records[0], records[2]]);
  });
});

describe("the committed study fixture", () => {
  it("has ranked cross references for the journey's verse, all in the canon", async () => {
    const rows = await readCrossReferenceFixture();
    expect(rows.length).toBeGreaterThan(100);
    expect(rows.every((row) => inFixture(row.fromVerse))).toBe(true);

    const john = rows.filter((row) => row.fromVerse === JOHN_3_16);
    expect(john.length).toBeGreaterThan(10);
    expect(john[0]).toEqual({ fromVerse: JOHN_3_16, toStart: 45005008, toEnd: 45005008, votes: 986 });
    // The journey quotes the best one from the Bible fixture.
    const bsb = await readFixture("bsb");
    expect(bsb.some((verse) => verse.verseId === john[0].toStart)).toBe(true);
  });

  it("has every source on the journey's verse, sanitized as stored", async () => {
    for (const source of COMMENTARY_SOURCES) {
      const records = await readCommentaryFixture(source.id);
      expect(records.length).toBeGreaterThan(0);
      expect(
        records.some(
          (record) => record.verseStart <= JOHN_3_16 && record.verseEnd >= JOHN_3_16,
        ),
      ).toBe(true);
      for (const record of records) {
        expect(sanitizeStudyHtml(record.html)).toBe(record.html);
        expect(studyText(record.html)).not.toBe("");
        expect(fixtureCommentary([record], FIXTURE_PASSAGES)).toHaveLength(1);
      }
    }
  });

  it("was built from the pinned sources, and reads back as written", async () => {
    const read = (name: string) => readFile(studyFixtureUrl(name), "utf8");

    const crossReferences = await read(CROSS_REFERENCES.id);
    expect(JSON.parse(crossReferences).sourceSha256).toBe(CROSS_REFERENCES.contentSha256);
    expect(
      serializeCrossReferences(CROSS_REFERENCES.contentSha256, await readCrossReferenceFixture()),
    ).toBe(crossReferences);

    for (const source of COMMENTARY_SOURCES) {
      const file = await read(source.id);
      expect(JSON.parse(file).sourceSha256).toBe(source.contentSha256);
      expect(
        serializeCommentary(source.id, source.contentSha256, await readCommentaryFixture(source.id)),
      ).toBe(file);
    }
  });

  it("stays small", async () => {
    let bytes = 0;
    for (const name of [CROSS_REFERENCES.id, ...COMMENTARY_SOURCES.map((source) => source.id)]) {
      bytes += (await readFile(studyFixtureUrl(name))).length;
    }
    expect(bytes).toBeLessThan(400_000);
  });
});
