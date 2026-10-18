import type { Unit } from "./read";

// Compares two copies of a source, unit by unit (see ./read.ts).

// A unit's words in both copies, cut down to where they differ.
export type Example = { label: string; before: string; after: string };

export type Counted = { count: number; labels: string[] };

export type UnitDiff = {
  before: number;
  after: number;
  added: Counted;
  removed: Counted;
  // The same words under another key: a verse given another number, a comment
  // moved to other verses.
  renumbered: { count: number; examples: { from: string; to: string }[] };
  // Units whose words changed.
  wording: { count: number; examples: Example[] };
  // Units whose words are the same and something else changed, with how many
  // changed in each way. A unit that changed in two ways counts once in
  // `count` and once under each facet.
  facets: { count: number; byFacet: Record<string, number>; labels: string[] };
  // For cross references: how many changed sides of the line the study panel
  // draws at zero votes.
  crossedZero: number;
};

const ink = (text: string) => text.replace(/\s+/g, "");

const CONTEXT = 40;
const LONGEST = 160;

const clip = (text: string) => (text.length > LONGEST ? `${text.slice(0, LONGEST)}…` : text);

// The stretch where two texts differ, with a few words either side.
export function excerpt(before: string, after: string): { before: string; after: string } {
  const shortest = Math.min(before.length, after.length);
  let head = 0;
  while (head < shortest && before[head] === after[head]) head++;
  let tail = 0;
  while (tail < shortest - head && before.at(-1 - tail) === after.at(-1 - tail)) tail++;

  // Back to the start of a word, and on to the end of one.
  let from = Math.max(0, head - CONTEXT);
  while (from > 0 && /\S/.test(before[from - 1])) from--;
  let keep = Math.max(0, tail - CONTEXT);
  while (keep > 0 && /\S/.test(before.at(-keep)!)) keep--;

  const cut = (text: string) =>
    (from > 0 ? "…" : "") +
    clip(text.slice(from, text.length - keep).replace(/\s+/g, " ")) +
    (keep > 0 ? "…" : "");
  return { before: cut(before), after: cut(after) };
}

export function diffUnits(before: readonly Unit[], after: readonly Unit[], examples: number): UnitDiff {
  const counted = (): Counted => ({ count: 0, labels: [] });
  const count = (into: Counted, label: string) => {
    into.count++;
    if (into.labels.length < examples) into.labels.push(label);
  };
  const diff: UnitDiff = {
    before: before.length,
    after: after.length,
    added: counted(),
    removed: counted(),
    renumbered: { count: 0, examples: [] },
    wording: { count: 0, examples: [] },
    facets: { count: 0, byFacet: {}, labels: [] },
    crossedZero: 0,
  };

  const old = new Map(before.map((unit) => [unit.key, unit]));
  const added: Unit[] = [];
  for (const unit of after) {
    const was = old.get(unit.key);
    if (!was) {
      added.push(unit);
      continue;
    }
    old.delete(unit.key);
    if (ink(was.text) !== ink(unit.text)) {
      diff.wording.count++;
      if (diff.wording.examples.length < examples) {
        diff.wording.examples.push({ label: unit.label, ...excerpt(was.text, unit.text) });
      }
      // Its other facets are positions in words that are no longer the same.
      continue;
    }
    const changed = Object.keys({ ...was.facets, ...unit.facets }).filter(
      (facet) => was.facets[facet] !== unit.facets[facet],
    );
    // The same words laid out on other lines.
    if (changed.length === 0 && was.text !== unit.text) changed.push("line breaks");
    if (changed.length === 0) continue;
    diff.facets.count++;
    if (diff.facets.labels.length < examples) diff.facets.labels.push(unit.label);
    for (const facet of changed) diff.facets.byFacet[facet] = (diff.facets.byFacet[facet] ?? 0) + 1;
    if ("votes" in unit.facets && Number(was.facets.votes) < 0 !== Number(unit.facets.votes) < 0) {
      diff.crossedZero++;
    }
  }

  // A unit that went and one that came with the same words are one unit under
  // a new key. Units without words (cross references) are never paired.
  const gone = new Map<string, Unit[]>();
  for (const unit of old.values()) {
    const words = ink(unit.text);
    if (words) gone.set(words, [...(gone.get(words) ?? []), unit]);
  }
  const moved = new Set<Unit>();
  for (const unit of added) {
    const from = gone.get(ink(unit.text))?.shift();
    if (!from) {
      count(diff.added, unit.label);
      continue;
    }
    moved.add(from);
    diff.renumbered.count++;
    if (diff.renumbered.examples.length < examples) {
      diff.renumbered.examples.push({ from: from.label, to: unit.label });
    }
  }
  for (const unit of old.values()) if (!moved.has(unit)) count(diff.removed, unit.label);
  return diff;
}

export const isEmpty = (diff: UnitDiff) =>
  diff.added.count + diff.removed.count + diff.renumbered.count + diff.wording.count + diff.facets.count === 0;
