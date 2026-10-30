import type { NextRequest } from "next/server";

import { getDb } from "@/db/client";
import { MAX_QUESTION_LENGTH, answerStream, capMessage, eventLine, preflight, type AskRequest } from "@/lib/ask/ask";
import { MAX_HISTORY_TURNS, type Turn } from "@/lib/ask/prompt";
import { dailyCap } from "@/lib/ask/store";
import { getSite } from "@/lib/site";

import { askAccess, askPassage } from "./access";

export const dynamic = "force-dynamic";

// A test cannot have the cap of a real install changed under it, so with the
// stub provider, and only then, a request may name its own.
const TEST_CAP_HEADER = "x-selah-test-cap";

const refuse = (message: string, status = 400) => Response.json({ error: message }, { status });

type Body = {
  reference?: unknown;
  translation?: unknown;
  question?: unknown;
  history?: unknown;
  fresh?: unknown;
};

// The turns before a question, as the page holds them.
function turnsFrom(history: unknown): Turn[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (turn): turn is Turn =>
        typeof turn?.question === "string" && typeof turn?.answer === "string",
    )
    .slice(-MAX_HISTORY_TURNS)
    .map(({ question, answer }) => ({ question: question.slice(0, MAX_QUESTION_LENGTH), answer }));
}

// A question about a passage. The answer comes as lines of JSON, as it is
// written; see AskEvent. A saved answer comes as one line, at once.
//
//   POST /api/ask { reference, translation, question, history?, fresh? }
export async function POST(request: NextRequest) {
  const access = await askAccess();
  if (access instanceof Response) return access;
  const { provider, model } = access;

  const body = (await request.json().catch(() => null)) as Body | null;
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) return refuse("Ask a question first.");
  if (question.length > MAX_QUESTION_LENGTH) {
    return refuse(`Keep a question under ${MAX_QUESTION_LENGTH} characters.`);
  }
  if (typeof body?.reference !== "string") return refuse("Say which passage this is about.");
  const passage = await askPassage(body.reference, typeof body.translation === "string" ? body.translation : undefined);
  if (passage instanceof Response) return passage;

  const db = getDb();
  const asked: AskRequest = {
    ...passage,
    question,
    history: turnsFrom(body.history),
    fresh: body.fresh === true,
  };
  const testCap = provider.name === "stub" ? request.headers.get(TEST_CAP_HEADER) : null;
  const cap = testCap !== null ? Number(testCap) : dailyCap((await getSite())?.settings);
  const first = await preflight(db, asked, { model, cap });
  if (first.kind === "capped") return refuse(capMessage(cap), 429);

  const events = first.kind === "saved" ? null : answerStream(db, provider, asked, first);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!events) {
        controller.enqueue(encoder.encode(eventLine((first as Extract<typeof first, { kind: "saved" }>).event)));
        controller.close();
        return;
      }
      const { done, value } = await events.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(eventLine(value)));
    },
    async cancel() {
      await events?.return(undefined);
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      // Not to be held back by compression or a proxy.
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

