import { AiDisabledError } from "./none";
import type { AiCompletionRequest, AiProvider } from "./types";

// Answers from Claude over the Anthropic Messages API, streamed. `fetch` and
// no SDK: this is one endpoint, read one way.
//
// Every model name is here and nowhere else. Sonnet answers questions; Haiku
// is for small tasks.
export const CLAUDE_ANSWER_MODEL = "claude-sonnet-5-5";
export const CLAUDE_SMALL_MODEL = "claude-haiku-5-5";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2026-10-21";
// Lets a declined request be answered by the model Anthropic recommends for
// it, inside the same call and stream. Sonnet only: Haiku has no fallback.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

const ANSWER_MAX_TOKENS = 8_000;
const SMALL_MAX_TOKENS = 1_024;

const ATTEMPTS = 3;
const BACKOFF_MS = 1_000;
const MAX_WAIT_MS = 20_000;
// How long the first byte, and then each next one, may take.
const TIMEOUT_MS = 45_000;

// Which of these a caller has words for: "key" is the owner's to fix, the
// rest pass or are not worth another try.
export type ClaudeFailure = "key" | "request" | "rate-limit" | "unavailable" | "refused" | "incomplete";

// Never quotes a request or the key.
export class ClaudeError extends Error {
  constructor(
    readonly failure: ClaudeFailure,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ClaudeError";
  }
}

const RETRIED = new Set([408, 429, 500, 502, 503, 504, 529]);

function retryAfterMs(response: Response): number | undefined {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}

// A response's failure, by its status.
function statusFailure(status: number): ClaudeError {
  if (status === 401 || status === 403) return new ClaudeError("key", "Anthropic refused the API key.");
  if (status === 429) return new ClaudeError("rate-limit", "Anthropic's rate limit was reached.");
  if (status >= 500) return new ClaudeError("unavailable", `Anthropic answered ${status}.`);
  return new ClaudeError("request", `Anthropic refused the request (${status}).`);
}

// An `error` event in the stream, by its type.
function eventFailure(type: unknown): ClaudeError {
  if (type === "rate_limit_error") return new ClaudeError("rate-limit", "Anthropic's rate limit was reached.");
  if (type === "authentication_error" || type === "permission_error") {
    return new ClaudeError("key", "Anthropic refused the API key.");
  }
  if (type === "invalid_request_error") return new ClaudeError("request", "Anthropic refused the request.");
  return new ClaudeError("unavailable", "Anthropic stopped answering.");
}

type SseEvent = { type?: string; delta?: { type?: string; text?: string; stop_reason?: string }; error?: { type?: string } };

// The `data:` of each event in a stream of server-sent events. An event that
// is not JSON is skipped: the protocol allows ones we do not know.
export async function* readEvents(
  body: ReadableStream<Uint8Array>,
  timeoutMs = TIMEOUT_MS,
): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const read = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new ClaudeError("unavailable", "Anthropic stopped answering.")),
        timeoutMs,
      );
    });
    try {
      return await Promise.race([reader.read(), timeout]);
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    for (;;) {
      const { done, value } = await read();
      if (value) buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = done ? "" : blocks.pop()!;
      for (const block of blocks) {
        const data = block
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data) continue;
        try {
          yield JSON.parse(data) as SseEvent;
        } catch {
          continue;
        }
      }
      if (done) return;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

type ClaudeOptions = {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Never logs or returns the key.
export function createClaudeProvider({
  apiKey,
  fetch: send = globalThis.fetch,
  sleep = wait,
  timeoutMs = TIMEOUT_MS,
}: ClaudeOptions): AiProvider {
  // Until the answer starts; from there readEvents() watches each next byte,
  // since a long answer may rightly take minutes.
  const open = async (request: AiCompletionRequest, small: boolean) => {
    const opening = new AbortController();
    const timer = setTimeout(() => opening.abort(), timeoutMs);
    try {
      return await send(ENDPOINT, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": API_VERSION,
          "content-type": "application/json",
          ...(small ? {} : { "anthropic-beta": FALLBACK_BETA }),
        },
        body: JSON.stringify({
          model: small ? CLAUDE_SMALL_MODEL : CLAUDE_ANSWER_MODEL,
          max_tokens: request.maxTokens ?? (small ? SMALL_MAX_TOKENS : ANSWER_MAX_TOKENS),
          stream: true,
          ...(request.system ? { system: request.system } : {}),
          messages: request.messages,
          output_config: { effort: small ? "low" : "medium" },
          ...(small ? {} : { fallbacks: "default" }),
        }),
        signal: opening.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  // One attempt's text. `wrote` says whether any reached the caller, after
  // which another attempt would repeat it.
  async function* attempt(
    response: Response,
    limited: boolean,
    wrote: { any: boolean },
  ): AsyncGenerator<string> {
    let stop: string | undefined;
    for await (const event of readEvents(response.body!, timeoutMs)) {
      if (event.type === "error") throw eventFailure(event.error?.type);
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
        wrote.any = true;
        yield event.delta.text;
      }
      if (event.type === "message_delta") stop = event.delta?.stop_reason ?? stop;
    }
    if (stop === "refusal") throw new ClaudeError("refused", "Claude declined to answer.");
    // A cut-off answer is not an answer, unless the caller asked for few words.
    if (stop === "max_tokens" && !limited) throw new ClaudeError("incomplete", "The answer was cut off.");
    if (!stop) throw new ClaudeError("unavailable", "Anthropic stopped answering.");
  }

  async function* stream(request: AiCompletionRequest): AsyncGenerator<string> {
    const small = request.tier === "small";
    const wrote = { any: false };
    let failure: ClaudeError | undefined;
    for (let tried = 0; tried < ATTEMPTS; tried++) {
      let delay = tried > 0 ? BACKOFF_MS * 2 ** (tried - 1) : 0;
      try {
        if (delay > 0) await sleep(delay);
        const response = await open(request, small);
        if (!response.ok) {
          failure = statusFailure(response.status);
          if (!RETRIED.has(response.status)) throw failure;
          // The server's word beats our guess, within reason.
          delay = retryAfterMs(response) ?? 0;
          if (tried < ATTEMPTS - 1 && delay > 0) await sleep(Math.min(delay, MAX_WAIT_MS));
          continue;
        }
        if (!response.body) throw new ClaudeError("unavailable", "Anthropic sent nothing back.");
        yield* attempt(response, request.maxTokens !== undefined, wrote);
        return;
      } catch (cause) {
        const error =
          cause instanceof ClaudeError ? cause : new ClaudeError("unavailable", "Anthropic could not be reached.", { cause });
        const retried = error.failure === "unavailable" || error.failure === "rate-limit";
        if (wrote.any || !retried) throw error;
        failure = error;
      }
    }
    throw failure!;
  }

  return {
    name: "claude",
    enabled: true,
    embeddingModel: null,
    minSimilarity: 0,
    answerModel: CLAUDE_ANSWER_MODEL,
    async complete(request) {
      let text = "";
      for await (const part of stream(request)) text += part;
      return { text };
    },
    stream,
    async embed() {
      throw new AiDisabledError();
    },
  };
}
