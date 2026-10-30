import type { Db } from "@/db/client";
import { ClaudeError } from "@/lib/ai/claude";
import type { AiProvider } from "@/lib/ai/types";
import type { VerseRange } from "@/lib/bible/verse-id";

import { AnswerParser, applyEvent, emptyAnswer, followsContract, type Answer, type AnswerEvent, type SectionId } from "./answer";
import { buildContext, citableOf, sourcesOf, type AskContext, type AskSources } from "./context";
import { ASK_SYSTEM_PROMPT, askMessages, type Turn } from "./prompt";
import { askDay, askKey, findAnswer, releaseQuestion, reserveQuestion, saveAnswer, type AskKey } from "./store";

// One question: a saved answer if there is one, else the day's cap, else the
// model, as a stream of events for the page. docs/ask.md says what goes where.

export const MAX_QUESTION_LENGTH = 500;

export type AskRequest = {
  ranges: VerseRange[];
  translation: AskContext["translation"];
  t?: string;
  question: string;
  // The turns before this one, oldest first.
  history: Turn[];
  // "Ask again": leaves the saved answer alone and counts toward the cap.
  fresh: boolean;
};

// What the page is sent, one JSON object to a line.
export type AskEvent =
  | { type: "saved"; answer: Answer; sources: AskSources; createdAt: string }
  | { type: "sources"; sources: AskSources }
  | AnswerEvent
  // The end of an answer. `saved`: it can be had again without asking.
  | { type: "done"; saved: boolean }
  | { type: "failed"; message: string };

export function failureMessage(error: unknown): string {
  const failure = error instanceof ClaudeError ? error.failure : "unavailable";
  switch (failure) {
    case "key":
      return "Anthropic did not accept the API key. Check it in Settings.";
    case "rate-limit":
      return "Claude has had too many questions just now. Try again in a minute.";
    case "refused":
      return "Claude declined to answer this question. Try putting it another way.";
    case "incomplete":
      return "The answer ran too long and was cut off, so it was not saved. Try a narrower question.";
    case "request":
      return "This question could not be sent. Try a shorter one.";
    default:
      return "Claude could not be reached. Try again in a minute.";
  }
}

export const capMessage = (cap: number) =>
  `That's today's ${cap} ${cap === 1 ? "question" : "questions"}, the limit set for this install. Saved answers still open, and more can be asked after midnight UTC. The limit is in Settings.`;

export type Preflight =
  | { kind: "saved"; event: Extract<AskEvent, { type: "saved" }> }
  | { kind: "capped" }
  | { kind: "go"; key: AskKey; day: string };

// What can be said before the model is asked. Reserves a question when it is to be.
export async function preflight(
  db: Db,
  { ranges, translation, question, history, fresh }: AskRequest,
  { model, cap }: { model: string; cap: number },
): Promise<Preflight> {
  const before = history.map((turn) => turn.question);
  const key = askKey(ranges, translation.id, question, model, before);
  if (!fresh) {
    const found = await findAnswer(db, key.key);
    if (found) {
      return {
        kind: "saved",
        event: { type: "saved", ...found.saved, createdAt: found.createdAt.toISOString() },
      };
    }
  }
  const day = askDay();
  return (await reserveQuestion(db, cap, day)) ? { kind: "go", key, day } : { kind: "capped" };
}

// The answer, as it is written. A question that came to nothing is given back
// to the day's cap.
export async function* answerStream(
  db: Db,
  provider: AiProvider,
  request: AskRequest,
  { key, day }: { key: AskKey; day: string },
): AsyncGenerator<AskEvent> {
  const answer = emptyAnswer();
  let section: SectionId | undefined;
  let wrote = false;
  try {
    const { ranges, translation, t, question, history } = request;
    const context = await buildContext(db, ranges, question, { translation, t, provider });
    const sources = sourcesOf(context);
    yield { type: "sources", sources };

    const parser = new AnswerParser(citableOf(context));
    const pass = function* (events: AnswerEvent[]) {
      for (const event of events) {
        section = applyEvent(answer, section, event);
        yield event;
      }
    };
    for await (const text of provider.stream({ system: ASK_SYSTEM_PROMPT, messages: askMessages(context, question, history) })) {
      wrote = true;
      yield* pass(parser.push(text));
    }
    yield* pass(parser.end());

    const whole = followsContract(answer);
    if (whole) await saveAnswer(db, key, { answer, sources });
    yield { type: "done", saved: whole };
  } catch (error) {
    if (!wrote) await releaseQuestion(db, day).catch(() => {});
    yield { type: "failed", message: failureMessage(error) };
  }
}

// As one line of the response.
export const eventLine = (event: AskEvent) => `${JSON.stringify(event)}\n`;
