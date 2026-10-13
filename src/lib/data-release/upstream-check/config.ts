// Everything the upstream check (`pnpm data:check`) decides by. A finding
// below these thresholds is printed in the run's log and files nothing; see
// "Checking upstream for changes" in the README.

export type UpstreamCheckConfig = {
  // The label every issue the check files carries. Created when missing.
  label: { name: string; color: string; description: string };
  // A finding is significant when its count is more than the number here, so
  // 0 means "any".
  significantAbove: {
    // Verses whose words changed.
    wordingVerses: number;
    // Verses added, removed or renumbered.
    numberingVerses: number;
    // Verses whose formatting changed and whose words did not: paragraph and
    // line breaks, red-letter spans, headings, footnotes.
    formattingVerses: number;
    // Verses on which a translation's two sources newly disagree.
    divergingVerses: number;
    // Commentary entries and study notes added, removed, moved or reworded.
    commentaryEntries: number;
    // Cross references added or removed, as a share of those pinned (0.01 is
    // 1%). OpenBible.info rebuilds its file daily as readers vote, so a few
    // come and go every week; that is not a reason to refresh.
    crossReferencesShare: number;
    // Cross references that cross the line the study panel draws: voted below
    // zero in one copy and not in the other. Same unit as above.
    crossReferencesShownShare: number;
  };
  // A source that cannot be fetched, or has moved, is reported only once it
  // has been so on every run for this many days. With the weekly schedule
  // that is the second run in a row.
  unreachableDays: number;
  // How many examples each finding gives in an issue.
  examples: number;
};

export const UPSTREAM_CHECK: UpstreamCheckConfig = {
  label: {
    name: "upstream-refresh",
    color: "1d76db",
    description: "A pinned source changed upstream; filed by the weekly upstream check",
  },
  significantAbove: {
    wordingVerses: 0,
    numberingVerses: 0,
    formattingVerses: 5,
    divergingVerses: 0,
    commentaryEntries: 0,
    crossReferencesShare: 0.01,
    crossReferencesShownShare: 0.01,
  },
  unreachableDays: 6,
  examples: 3,
};
