"use client";

import { createContext, useContext, useEffect, useRef, useState, type FormEvent } from "react";

import { Attribution } from "@/components/passage/passage";
import type { AskEvent } from "@/lib/ask/ask";
import { applyEvent, answerText, emptyAnswer, type Answer, type AnswerSegment, type SectionId } from "@/lib/ask/answer";
import type { AskSources } from "@/lib/ask/context";
import type { Turn } from "@/lib/ask/prompt";
import { quoteCredit, type SourceQuote } from "@/lib/ask/quote";
import { CROSS_REFERENCES } from "@/lib/study/sources";

// A short conversation about one passage. It lives in this browser tab, per
// passage and translation (sessionStorage): the server keeps nothing of it
// but the saved answers. In the editor `onInsertPassage` and `onInsertQuote`
// put a cited passage or a quote in the post, each on its own click; an
// answer's own words have no way in.

const MAX_TURNS = 6;
const MAX_QUESTION_LENGTH = 500;

type TurnView = {
  question: string;
  answer: Answer;
  sources?: AskSources;
  state: "streaming" | "done" | "failed";
  // Whether this answer came from the saved ones, and when it was written.
  savedAt?: string;
  // Whether it can be had again without asking.
  kept?: boolean;
  message?: string;
};

type AskChatProps = {
  // "John 3:16-21", as formatReference() writes it.
  reference: string;
  // A translation's id.
  translation: string;
  onInsertPassage?: (reference: string) => void;
  onInsertQuote?: (quote: SourceQuote) => void;
};

const quiet =
  "inline-flex h-7 cursor-pointer items-center rounded px-2 text-xs font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-stone-500 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100";
const link = "text-sky-700 underline-offset-2 hover:underline dark:text-sky-400";
const fine = "underline decoration-stone-300 underline-offset-2 hover:text-stone-800 dark:decoration-stone-600 dark:hover:text-stone-100";

function read(key: string): TurnView[] {
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) ?? "[]") as TurnView[];
    return stored.filter((turn) => turn.state !== "streaming");
  } catch {
    return [];
  }
}

function write(key: string, turns: readonly TurnView[]) {
  try {
    sessionStorage.setItem(key, JSON.stringify(turns.filter((turn) => turn.state !== "streaming")));
  } catch {
    // A full or blocked store costs the conversation, not the answer.
  }
}

// Where links go. Beside a draft they open a new tab, so that following one
// does not leave the post.
const LinkTarget = createContext<"_blank" | undefined>(undefined);

// A credit line's text and links, as printed under a quote.
export function Credit({ quote, newTab }: { quote: SourceQuote; newTab?: boolean }) {
  const inherited = useContext(LinkTarget);
  const target = newTab ? "_blank" : inherited;
  return (
    <>
      {quoteCredit(quote).map((node, i) => {
        const href = node.marks?.find((mark) => mark.type === "link");
        return href?.type === "link" ? (
          <a key={i} href={href.attrs.href} target={target} rel="noreferrer" className={fine}>
            {node.text}
          </a>
        ) : (
          <span key={i}>{node.text}</span>
        );
      })}
    </>
  );
}

function Quote({ quote, onInsert }: { quote: SourceQuote; onInsert?: (quote: SourceQuote) => void }) {
  return (
    <figure data-ask-quote={quote.sourceId} className="my-3 border-l-2 border-stone-300 pl-3 dark:border-stone-700">
      <blockquote className="font-serif text-[0.95rem] leading-6 text-stone-800 dark:text-stone-200">{quote.text}</blockquote>
      <figcaption data-quote-credit className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">
        <Credit quote={quote} />
      </figcaption>
      {onInsert && (
        <button type="button" onClick={() => onInsert(quote)} aria-label={`Insert the quote from ${quote.label}`} className={`${quiet} mt-1`}>
          Insert quote
        </button>
      )}
    </figure>
  );
}

function Segment({ segment, onInsertQuote }: { segment: AnswerSegment; onInsertQuote?: (quote: SourceQuote) => void }) {
  const target = useContext(LinkTarget);
  switch (segment.type) {
    case "text":
      return <span className="whitespace-pre-line">{segment.text}</span>;
    case "cite":
      return (
        <a href={segment.href} target={target} data-citation={segment.reference} className={link}>
          {segment.reference}
        </a>
      );
    case "source":
      return (
        <a href={segment.href} target={target} data-source-citation={segment.id} className={link}>
          {segment.label}
        </a>
      );
    case "quote":
      return <Quote quote={segment.quote} onInsert={onInsertQuote} />;
  }
}

function Sources({ sources, onInsertPassage }: { sources: AskSources; onInsertPassage?: (reference: string) => void }) {
  const target = useContext(LinkTarget);
  const left = sources.leftOut.map(({ kind, count }) => `${count} ${LEFT_OUT[kind]}`);
  return (
    <details open data-ask-sources className="mt-3 border-t border-stone-200 pt-2 dark:border-stone-800">
      <summary className="cursor-pointer text-xs font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">
        Sources
      </summary>
      {sources.verses.length > 0 && (
        <ul aria-label="Verses" className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {sources.verses.map(({ reference, href, kind }) => (
            <li key={`${kind}${reference}`} data-source-verse={reference} data-kind={kind} className="flex items-center gap-1">
              <a href={href} target={target} className={link}>
                {reference}
              </a>
              {onInsertPassage && (
                <button type="button" onClick={() => onInsertPassage(reference)} aria-label={`Insert ${reference}`} className={quiet}>
                  Insert
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {sources.commentary.length > 0 && (
        <ul aria-label="Commentary" className="mt-2 space-y-2 text-xs leading-5 text-stone-500 dark:text-stone-400">
          {sources.commentary.map((source) => (
            <li key={source.id} data-source-commentary={source.id}>
              <p className="text-stone-700 dark:text-stone-300">
                <a href={source.href} target={target} className={fine}>
                  {source.label}
                  {source.work ? `, ${source.work}` : ""}, on {source.reference}
                </a>
              </p>
              <p>
                {source.attribution}{" "}
                {source.licenseUrl && (
                  <>
                    <a href={source.licenseUrl} target={target} rel="license noreferrer" className={fine}>
                      {source.license}
                    </a>{" "}
                  </>
                )}
                <a href={source.sourceUrl} target={target} rel="noreferrer" className={fine}>
                  Source
                </a>
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 space-y-1">
        {sources.verses.some((verse) => verse.kind === "cross-reference") && (
          <p className="text-xs text-stone-500 dark:text-stone-400">{CROSS_REFERENCES.attribution}.</p>
        )}
        <Attribution translation={sources.translation} />
        {left.length > 0 && (
          <p data-ask-left-out className="text-xs text-stone-500 dark:text-stone-400">
            Left out to keep the question short: {left.join(", ")}.
          </p>
        )}
      </div>
    </details>
  );
}

const LEFT_OUT: Record<AskSources["leftOut"][number]["kind"], string> = {
  passage: "verses of the passage",
  footnote: "footnotes",
  commentary: "commentary entries",
  "cross-reference": "cross references",
  related: "related passages",
  keyword: "keyword matches",
};

const droppedNote = ({ dropped }: Answer) => {
  const citations = dropped.filter((each) => each.kind === "citation").length;
  const quotes = dropped.length - citations;
  return [
    citations > 0 &&
      `${citations} ${citations === 1 ? "citation" : "citations"} to verses outside these sources ${citations === 1 ? "was" : "were"} removed.`,
    quotes > 0 &&
      `${quotes} ${quotes === 1 ? "quotation" : "quotations"} that could not be found in ${quotes === 1 ? "its source was" : "their sources were"} removed.`,
  ]
    .filter(Boolean)
    .join(" ");
};

type TurnProps = Pick<AskChatProps, "onInsertPassage" | "onInsertQuote"> & {
  turn: TurnView;
  onAgain?: () => void;
};

// The blank lines around a quote are the quote's own margin, and a section
// has none at its ends.
function tidy(segments: readonly AnswerSegment[]): AnswerSegment[] {
  return segments.flatMap((segment, i): AnswerSegment[] => {
    if (segment.type !== "text") return [segment];
    const afterBlock = i === 0 || segments[i - 1].type === "quote";
    const beforeBlock = i === segments.length - 1 || segments[i + 1].type === "quote";
    const start = afterBlock ? segment.text.trimStart() : segment.text;
    const text = beforeBlock ? start.trimEnd() : start;
    return text ? [{ type: "text" as const, text }] : [];
  });
}

function TurnBlock({ turn, onAgain, onInsertPassage, onInsertQuote }: TurnProps) {
  const { question, answer, sources, state, savedAt, message } = turn;
  const note = droppedNote(answer);
  return (
    <li data-ask-turn data-ask-state={state} className="text-sm leading-6">
      <p data-ask-question className="font-medium text-stone-900 dark:text-stone-100">
        {question}
      </p>
      {savedAt && (
        <p className="mt-1 flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
          <span data-ask-saved>Saved answer</span>
          {onAgain && (
            <button type="button" onClick={onAgain} className={quiet}>
              Ask again
            </button>
          )}
        </p>
      )}
      {answer.sections
        .filter((section) => section.segments.length > 0)
        .map((section) => (
          <section key={section.id} data-ask-section={section.id} className="mt-2">
            <h4 className="text-xs font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">{section.title}</h4>
            <div className="mt-1 text-stone-800 dark:text-stone-200">
              {tidy(section.segments).map((segment, i) => (
                <Segment key={i} segment={segment} onInsertQuote={onInsertQuote} />
              ))}
            </div>
          </section>
        ))}
      {state === "streaming" && answer.sections.every((section) => section.segments.length === 0) && (
        <p role="status" className="mt-2 text-stone-500 dark:text-stone-400">
          Reading the passage and its sources…
        </p>
      )}
      {note && (
        <p data-ask-dropped className="mt-2 text-xs text-stone-500 dark:text-stone-400">
          {note}
        </p>
      )}
      {message && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
          {message}
        </p>
      )}
      {state === "done" && turn.kept === false && (
        <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
          This answer did not keep to the usual two sections, so it was not saved.
        </p>
      )}
      {sources && state !== "streaming" && <Sources sources={sources} onInsertPassage={onInsertPassage} />}
    </li>
  );
}

export function AskChat({ reference, translation, onInsertPassage, onInsertQuote }: AskChatProps) {
  const key = `selah-ask:${translation}:${reference}`;
  const [turns, setTurns] = useState<TurnView[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const live = useRef<AbortController | null>(null);

  // What this tab has already asked about this passage.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTurns(read(key));
    setNotice(null);
    return () => live.current?.abort();
  }, [key]);

  const update = (index: number, change: (turn: TurnView) => TurnView) =>
    setTurns((current) => {
      const next = current.map((turn, i) => (i === index ? change(turn) : turn));
      write(key, next);
      return next;
    });

  const ask = async (asked: string, before: TurnView[], fresh: boolean) => {
    const index = before.length;
    const answer = emptyAnswer();
    let section: SectionId | undefined;
    setTurns([...before, { question: asked, answer, state: "streaming" }]);
    setBusy(true);
    setNotice(null);
    const controller = new AbortController();
    live.current = controller;

    const history: Turn[] = before
      .filter((turn) => turn.state === "done")
      .map((turn) => ({ question: turn.question, answer: answerText(turn.answer) }));
    // Paints what has come, as a copy, so React sees a change.
    const paint = (more: Partial<TurnView> = {}) =>
      update(index, (turn) => ({ ...turn, ...more, answer: structuredClone(answer) }));

    const handle = (event: AskEvent) => {
      switch (event.type) {
        case "saved":
          update(index, (turn) => ({ ...turn, answer: event.answer, sources: event.sources, state: "done", savedAt: event.createdAt, kept: true }));
          return;
        case "sources":
          paint({ sources: event.sources });
          return;
        case "done":
          paint({ state: "done", kept: event.saved });
          return;
        case "failed":
          paint({ state: "failed", message: event.message });
          return;
        default:
          section = applyEvent(answer, section, event);
          paint();
      }
    };

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reference, translation, question: asked, history, fresh }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        // Nothing was asked: the question goes back in the box.
        setTurns(before);
        setQuestion(asked);
        setNotice(body?.error ?? "This question could not be sent. Try again in a minute.");
        return;
      }
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop()!;
        for (const line of lines) if (line) handle(JSON.parse(line) as AskEvent);
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      paint({ state: "failed", message: "The answer stopped coming. Check the connection and try again." });
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const asked = question.trim();
    if (!asked || busy || turns.length >= MAX_TURNS) return;
    setQuestion("");
    void ask(asked, turns, false);
  };

  const full = turns.length >= MAX_TURNS;
  return (
    <LinkTarget.Provider value={onInsertQuote ? "_blank" : undefined}>
      <div data-ask-chat={reference}>
      {turns.length > 0 && (
        <ol aria-label="Questions and answers" className="space-y-5">
          {turns.map((turn, i) => (
            <TurnBlock
              key={i}
              turn={turn}
              onAgain={!busy && i === turns.length - 1 ? () => void ask(turn.question, turns.slice(0, i), true) : undefined}
              onInsertPassage={onInsertPassage}
              onInsertQuote={onInsertQuote}
            />
          ))}
        </ol>
      )}
      {notice && (
        <p role="alert" data-ask-notice className="mt-3 text-sm text-red-700 dark:text-red-400">
          {notice}
        </p>
      )}
      {full ? (
        <p className="mt-4 text-sm text-stone-500 dark:text-stone-400">That is as long as a conversation goes here.</p>
      ) : (
        <form onSubmit={submit} aria-label={`Ask about ${reference}`} className="mt-4">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) submit(event);
            }}
            rows={2}
            maxLength={MAX_QUESTION_LENGTH}
            aria-label="Your question"
            placeholder={turns.length > 0 ? "Ask a follow-up" : "What would you like to know about this passage?"}
            className="w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-2 text-sm placeholder:text-stone-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-stone-500 dark:border-stone-700 dark:bg-stone-900"
          />
          <div className="mt-1 flex items-center justify-between gap-2">
            <button
              type="submit"
              disabled={busy || !question.trim()}
              className="h-8 cursor-pointer rounded-md bg-stone-900 px-3 text-sm font-medium text-stone-50 hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 disabled:cursor-default disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
            >
              Ask
            </button>
            {turns.length > 0 && !busy && (
              <button
                type="button"
                onClick={() => {
                  setTurns([]);
                  write(key, []);
                }}
                className={quiet}
              >
                Start again
              </button>
            )}
          </div>
        </form>
      )}
      <p className="mt-3 text-xs leading-5 text-stone-500 dark:text-stone-400">
        Answers come from Claude, reading only this passage and the sources listed with each answer. Check them against the text.
      </p>
      </div>
    </LinkTarget.Provider>
  );
}
