# The Ask contract

What Claude is told, what it must write, and what Selah does with it. Change this file with `src/lib/ask/prompt.ts` and `src/lib/ask/answer.ts`, and raise `ANSWER_VERSION` when the shape of an answer changes, which leaves saved answers behind.

Nothing the model writes is trusted as it stands. The model proposes; `answer.ts` checks it against the context the model was given.

## What is sent

One plain request to the Messages API, from the server, with the owner's key: no beta features and no fallback model. The model is `CLAUDE_ANSWER_MODEL` in `src/lib/ai/claude.ts`, the one place model names are pinned, so the model in a saved answer's key is the one that wrote it. If Claude declines, the page says so.

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
- One entry is at most about 2,000 characters: the paragraphs that share the most words with the question and the passage, in their own order (`excerpt="true"`). Where paragraphs were skipped between two kept ones, the text says `[…]`, so a quote cannot run across the gap as if nothing were missing.
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
| Citation whose verses all had their text in the context, or that is one item's whole id | A link into the reader |
| Citation of anything else, including a verse left out by the budget | Removed and counted; the page says so. Never a link |
| `[[c1]]` of a commentary or note in the context | A link, with its name and tradition from the source |
| Quote whose words are in that entry, in order | Shown with its credit |
| Quote not found in the entry, with no or an unknown source id, or under "What the text says" | Removed and counted |
| Quote over 50 words | Cut, and marked `[…]` |
| Text before the first heading | Ignored |
| An answer missing a section | Shown with a note, and not saved |

Quote words are compared as whole words, without regard to case, spacing, or the style of quotation marks and dashes.

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

- That is plain CommonMark, so it needs no storage format of its own.
- In the editor the quote is one block, `sourceQuote` (`src/components/editor/source-quote-node.tsx`), built like the passage block. Its attributes are the source id, the passage and its link, the words, and what the credit is made from; the block prints the words and `quoteCredit()` and has no editable text. It is selected, dragged, moved, deleted and undone whole. Nothing can wrap it in a list or a quote, Enter beside it adds a paragraph rather than splitting it, and the toolbar's Quote cannot lift its words out. So in the editor, the credit cannot be deleted, reworded or separated from the words.
- `docToMarkdown` writes the block as the same blockquote, from its attributes. `markdownToDoc` reads a blockquote at the top of a post back as the block only when it is exactly what `quoteNode()` makes for a source in the table: plain paragraphs of words, then the app's credit for that source, unchanged, linking that source's address and license (`readSourceQuote()`). Every other blockquote, including one that only names the source or one whose credit was edited in an earlier version, opens as an ordinary blockquote. So a post opens and is saved again byte for byte, whether it was saved before the block existed or after.
- A paste brings a block only when its attributes make that same credit (`checkedQuote()`).
- `shareAlikeQuotes()` finds a blockquote naming the source in stored Markdown, with no column. `loadFeedEntries()` passes the result to `<FeedItem>` and `entryHtml()`, so the permalink, the feed and RSS/Atom print the notice.
- Excerpts, descriptions, Open Graph images and the name of an untitled note leave out every blockquote (`markdownExcerpt(…, { quotes: false })` in `bodyText`), not only ones that name a source: the notice depends on the credit staying in the quote, and an excerpt has no room for it. So a quote whose credit was deleted or reworded, or that was split from it, still stays out. The post's full content is untouched. A post that is only quotes gets the generic name ("Note", "Reflection" or its passage) and no description.
- What this guarantees: a quote inserted from Ask keeps its credit while the post is edited, and while the post holds it, the notice is printed and excerpts leave it out. What it does not: words of a note put in a post without Insert (pasted from the study panel or an answer, or typed) carry no credit, so they get no notice, and they are left out of excerpts only when they sit in a blockquote. The editor warns about such words (below) but nothing stops them being published. Writing of the owner's own placed inside an old blockquote that was an inserted quote is read as part of the quote.

Warning about a note's words without its credit (`src/lib/items/uncredited.ts`, `src/lib/items/source-words.ts`):

- **When.** `checkUncreditedAction(id)` reads the saved post. The publish menu calls it before publishing as Public or Unlisted and before an Update to a published post; the editor calls it 1.5 s after each save of a published post, and on opening one. Nothing runs per keystroke.
- **What counts.** A run of `MATCH_WORDS` (12) or more words, in order, that is in one note of a share-alike source, and not inside a top-level blockquote whose text names that source in a post where `shareAlikeQuotes()` finds it too (that is, where the notice is printed). Words are compared without case, accents, apostrophes or punctuation, and words with no letters (verse numbers, references) are skipped. One changed, added or missing word breaks a run. Paraphrase is not detected.
- **Not Scripture.** Runs a note shares with any translation in `verse` are taken out of the index, so quoting a verse that a note also quotes never warns.
- **The index.** All notes of the share-alike sources are read once per server process, on the first check, and kept in memory as a sorted table of 53-bit keys, one per run, with their note (`RunIndex`). It is built again when the number of notes or translations changes. A key that matches is always checked word for word against the note before anything is reported. For the whole of Tyndale Open Study Notes (16,913 notes, about 0.7 million words with letters) with the BSB, WEB and KJV, the table holds about 490,000 runs in 6 MB. With the notes' HTML, the check keeps about 32 MB, and the first check takes about 3 seconds. After that, a check takes a few milliseconds, plus two `count(*)` queries.
- **What it says.** Up to five notes, in the order of the post: the passage (linking the note in the reader's study panel), how many words match, the first 16 of them, and the source's page and license. A sentence the notes repeat on several passages is named once.
- **What it does not do.** It never edits the post and never stops publishing. "Publish anyway" (or "Update anyway") goes on, and "Dismiss" hides the banner. Either one sets those matches aside for as long as the post stays open; reopening the post shows them again. When the notes are not imported, or the check fails, the editor carries on as if nothing was found. There is no automatic "Restore credit": wrapping the copied words in a quote would not make them the note's quote, since they may be part of a sentence, cover several notes or have been shortened, and the credit has to name a passage. The remedy is to insert the note from Ask and remove the copy.
- **Measured.** With the full notes and the three translations, the notes of Matthew Henry, JFB and Clarke (about 11.5 million words) were checked as if they were posts. Four warned. Three were older wording, written long before the notes, that the notes also contain word for word (a saying, and a disputed reading of 1 John 5:7), and one was a coincidental 12-word phrase. Every one of 420 sentences of 14 or more words taken from the notes and pasted into prose was found.

The owner's own writing is not relicensed: only the quoted note is under CC BY-SA 4.0. Text reworked from a note, rather than quoted, is an adaptation and is under that license too.

## Cache and cap

- `ask_answer` is keyed by a hash of `ANSWER_VERSION`, the normalized passage, the translation, the normalized question and the questions before it in the conversation, and the model. So a first question is keyed by exactly passage, translation, question and model.
- `ask_usage` has one row per UTC day. One `insert … on conflict … where questions < cap` takes a question, so two at once cannot both take the last.
- A cache hit costs nothing. "Ask again" skips the cache, counts, and replaces the saved answer.
- A question is reserved before the model is called and given back if no text comes of it, for any reason: a failure, an empty answer, or the page leaving first.

## Who may ask

The owner alone: `askAccess()` in `src/app/api/ask/access.ts` starts every Ask route. Signed out is a 401. An install that cannot answer is a 404.

## Stub

`AI_PROVIDER=stub` writes a canned answer in this shape from the context, with no network. A question containing "outside the context" cites a verse that is not there, so a test can see it removed.
