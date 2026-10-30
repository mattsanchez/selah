# The Ask contract

What Claude is told, what it must write, and what Selah does with it. Change this file with `src/lib/ask/prompt.ts` and `src/lib/ask/answer.ts`, and raise `ANSWER_VERSION` when the shape of an answer changes, which leaves saved answers behind.

Nothing the model writes is trusted as it stands. The model proposes; `answer.ts` checks it against the context the model was given.

## What is sent

One request to the Messages API, from the server, with the owner's key. The model is `CLAUDE_ANSWER_MODEL` in `src/lib/ai/claude.ts`, the one place model names are pinned.

- `system`: `ASK_SYSTEM_PROMPT`.
- `messages`: the context and question, after the earlier turns of the conversation (at most three).

The context holds, in the order they are filled:

| Kind | `id` to cite | Share of the budget |
| :--- | :--- | ---: |
| `passage`, a verse each, in the translation being read | `43003016` | 37.5% |
| `footnote` on those verses | not cited | 5% |
| `commentary` and `study-note` entries overlapping the passage | `c1`, `c2`… | 35% |
| `cross-reference`, best voted first, with the verses' text | `45005008-45005008` | 10% |
| `related`, windows near the question and the passage | `19094017-19094020` | 7.5% |
| `keyword`, the question's words, only when nothing was found by meaning | `45005008` | 5% |

**Tyndale note text is sent**, as `study-note` items with `license="CC BY-SA 4.0"`. Nothing of the owner's is: no highlights, notes, reflections, account details or settings.

## The budget

About 8,000 tokens at four characters to a token (`CONTEXT_TOKENS`). A kind's unused share passes to the next.

- A kind stops at its first item that does not fit, since items are in order of worth. So the end of a very long passage is what goes, and those verses cannot be cited.
- Commentary is taken round-robin: every source's most specific entry, then every source's second, so that one long commentary does not crowd out other traditions.
- One entry is at most about 2,000 characters: the paragraphs that share the most words with the question and the passage, in their own order (`excerpt="true"`).
- What was left out is counted, told to the model, and listed with the answer's sources.

## What the model must write

Exactly two sections, in order, in plain paragraphs:

```
## What the text says

Only what the verses state, each claim cited [[43003016]], or a range [[43003016-43003018]].

## Interpretation

Matthew Henry (English Puritan tradition) writes that… [[c1]]

<quote source="c2">the exact words of the entry</quote>
```

- **Citations**: `[[verse id]]`, `[[start-end]]`, or `[[item id]]` for a commentary or note.
- **Quotes**: `<quote source="ITEM ID">…</quote>`, only under Interpretation, about 40 words at most, with `[…]` for anything left out. The source id is required on every quote: it is what attribution is added from.
- **No credit lines**: the app adds those.
- **Notes under CC BY-SA 4.0** must be quoted, not rewritten or summarized, and the source named when they are quoted.

### Tone

From the spec, in the system prompt:

- Keep what the text says apart from what people have made of it.
- No denominational position. The only traditions in an answer are those of the cited sources, and they are named.
- Where sources differ, say so and give more than one reading. Where they agree, do not imply that all Christians do.
- No pastoral advice, application or theology presented as what scripture says.
- When the text, or the sources, are silent, say so. Nothing from memory.

## What Selah does with it

`AnswerParser` reads the text as it streams, and the same events build the answer on the server and on the page.

| Written | Result |
| :--- | :--- |
| Citation whose verses are all in the context's verse items | A link into the reader |
| Citation of anything else, including a verse left out by the budget | Removed and counted; the page says so. Never a link |
| `[[c1]]` of a commentary or note in the context | A link, with its name and tradition from the source |
| Quote whose words are in that entry, in order | Shown with its credit |
| Quote not found in the entry, with no or an unknown source id, or under "What the text says" | Removed and counted |
| Quote over 50 words | Cut, and marked `[…]` |
| Text before the first heading | Ignored |
| An answer missing a section | Shown with a note, and not saved |

Words are compared without regard to case, spacing, or the style of quotation marks and dashes.

## An answer's schema

Stored in `ask_answer.answer` as `SavedAnswer`, and sent to the page as lines of JSON (`AskEvent`):

```ts
type SavedAnswer = { answer: Answer; sources: AskSources };

type Answer = {
  sections: { id: "text" | "interpretation"; title: string; segments: AnswerSegment[] }[];
  dropped: { kind: "citation" | "quote"; written: string }[];
};

type AnswerSegment =
  | { type: "text"; text: string }
  | { type: "cite"; range: VerseRange; reference: string; href: string }
  | { type: "source"; id: string; label: string; reference: string; href: string }
  | { type: "quote"; quote: SourceQuote };

type SourceQuote = {
  sourceId: string;   // the source's id, from the context and never from the model's words
  label: string;      // "Matthew Henry (English Puritan tradition)"
  work?: string;
  reference: string;  // the passage the entry is on
  href: string;
  text: string;       // "[…]" wherever words were left out
  shortened: boolean;
  license: string;    // from commentary_source
  attribution: string;
  sourceUrl: string;
  shareAlike?: { name: string; credit: string; licenseUrl: string };
};
```

## Sources and traditions

`ASK_SOURCES` in `src/lib/ask/sources.ts`. Retrieval reads exactly these, so a new source is one line. License, attribution and address come from `commentary_source`.

| Source | Tradition |
| :--- | :--- |
| Matthew Henry | English Puritan |
| Jamieson, Fausset and Brown | Protestant evangelical |
| Adam Clarke | Wesleyan Methodist |
| Tyndale Open Study Notes | Protestant evangelical |

## Share-alike

A source with `shareAlike` in that table has a license that travels with its words. Today that is the Tyndale Open Study Notes, CC BY-SA 4.0.

- Every quote carries a credit and a license link, added from the source id: on an answer, on a card and in a post.
- A quote inserted into a post is a blockquote with the credit inside it:

  ```markdown
  > The words of the note […]
  >
  > — Adapted from [Tyndale Open Study Notes](https://tyndaleopenresources.com/) (Protestant evangelical tradition) on [John 3:16](/read/john-3.16), © 2022 Tyndale House Publishers, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). This quoted note is under that license; the rest of this post is not.
  ```

- That is plain CommonMark, so it needs no storage format of its own and survives the editor's round trip.
- `shareAlikeQuotes()` finds a blockquote naming the source in stored Markdown, with no column. `loadFeedEntries()` passes the result to `<FeedItem>` and `entryHtml()`, so the permalink, the feed and RSS/Atom print the notice.
- `withoutShareAlikeQuotes()` takes the quote out of excerpts, descriptions and Open Graph images, which have no room for what is owed to it.

The owner's own writing is not relicensed: only the quoted note is under CC BY-SA 4.0. Text reworked from a note, rather than quoted, is an adaptation and is under that license too.

## Cache and cap

- `ask_answer` is keyed by a hash of `ANSWER_VERSION`, the normalized passage, the translation, the normalized question and the questions before it in the conversation, and the model. So a first question is keyed by exactly passage, translation, question and model.
- `ask_usage` has one row per UTC day. One `insert … on conflict … where questions < cap` takes a question, so two at once cannot both take the last.
- A cache hit costs nothing. "Ask again" skips the cache, counts, and replaces the saved answer.
- A question is reserved before the model is called and given back if the call fails before any text.

## Who may ask

The owner alone: `askAccess()` in `src/app/api/ask/access.ts` starts every Ask route. Signed out is a 401. An install that cannot answer is a 404.

## Stub

`AI_PROVIDER=stub` writes a canned answer in this shape from the context, with no network. A question containing "outside the context" cites a verse that is not there, so a test can see it removed.
