import { describe, expect, it, vi } from "vitest";

import { CLAUDE_ANSWER_MODEL, CLAUDE_SMALL_MODEL, ClaudeError, createClaudeProvider, readEvents } from "./claude";

// The client against a stand-in for fetch: no test here reaches Anthropic.

const KEY = "sk-ant-not-a-real-key";

const sse = (...events: object[]) => events.map((event) => `event: x\ndata: ${JSON.stringify(event)}\n\n`).join("");
const delta = (text: string) => ({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } });
const stop = (stop_reason: string) => ({ type: "message_delta", delta: { stop_reason }, usage: { output_tokens: 3 } });
const WHOLE = sse(
  { type: "message_start", message: { id: "msg" } },
  { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "hmm" } },
  delta("Hello "),
  delta("there"),
  stop("end_turn"),
  { type: "message_stop" },
);

// A body that arrives in these pieces.
const body = (...pieces: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) controller.enqueue(new TextEncoder().encode(piece));
      controller.close();
    },
  });

const respond = (text: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(status === 200 ? body(text) : text, { status, headers });

function client(...responses: (Response | Error)[]) {
  const send = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  });
  const sleep = vi.fn(async () => {});
  return { provider: createClaudeProvider({ apiKey: KEY, fetch: send as unknown as typeof fetch, sleep }), send, sleep };
}

async function collect(stream: AsyncIterable<string>) {
  const pieces: string[] = [];
  for await (const piece of stream) pieces.push(piece);
  return pieces;
}

const failure = async (stream: AsyncIterable<string>) => {
  const error = await collect(stream).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(ClaudeError);
  return error as ClaudeError;
};

const ask = { messages: [{ role: "user" as const, content: "Why?" }] };

describe("readEvents", () => {
  it("reads events cut anywhere between chunks, and skips what is not JSON", async () => {
    const text = `data: {"a":1}\n\ndata: not json\n\n: comment\n\ndata: {"b":2}\n\n`;
    const events = [];
    for await (const event of readEvents(body(text.slice(0, 5), text.slice(5, 22), text.slice(22)))) events.push(event);
    expect(events).toEqual([{ a: 1 }, { b: 2 }]);
  });
});

describe("the Claude client", () => {
  it("sends the pinned model, version and key, streaming, and nothing of the key in the body", async () => {
    const { provider, send } = client(respond(WHOLE));
    await collect(provider.stream({ ...ask, system: "Be brief." }));
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    const sent = JSON.parse(init.body as string);
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(headers["x-api-key"]).toBe(KEY);
    expect(headers["anthropic-version"]).toBe("2026-10-21");
    expect(sent).toMatchObject({ model: CLAUDE_ANSWER_MODEL, stream: true, system: "Be brief.", messages: ask.messages });
    expect(init.body).not.toContain(KEY);
  });

  it("sends a small task to the small model, without the fallback that model lacks", async () => {
    const { provider, send } = client(respond(WHOLE));
    await provider.complete({ ...ask, tier: "small", maxTokens: 16 });
    const [, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.parse(init.body as string);
    expect(sent.model).toBe(CLAUDE_SMALL_MODEL);
    expect(sent.max_tokens).toBe(16);
    expect(sent.fallbacks).toBeUndefined();
    expect((init.headers as Record<string, string>)["anthropic-beta"]).toBeUndefined();
  });

  it("streams text as it comes and leaves thinking out", async () => {
    const { provider } = client(respond(WHOLE));
    expect(await collect(provider.stream(ask))).toEqual(["Hello ", "there"]);
  });

  it("gathers the same text with complete()", async () => {
    const { provider } = client(respond(WHOLE));
    expect((await provider.complete(ask)).text).toBe("Hello there");
  });

  it("waits and retries a 429 as the server says", async () => {
    const { provider, send, sleep } = client(respond("slow down", 429, { "retry-after": "7" }), respond(WHOLE));
    expect((await collect(provider.stream(ask))).join("")).toBe("Hello there");
    expect(send).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(7_000);
  });

  it("retries 529 overloaded with backoff, and gives up with a rate of its own", async () => {
    const { provider, send, sleep } = client(respond("", 529), respond("", 529), respond("", 529));
    expect((await failure(provider.stream(ask))).failure).toBe("unavailable");
    expect(send).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("retries an overloaded error that arrives in the stream, before any text", async () => {
    const { provider, send } = client(
      respond(sse({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } })),
      respond(WHOLE),
    );
    expect((await collect(provider.stream(ask))).join("")).toBe("Hello there");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("does not retry once text has been written: that would repeat it", async () => {
    const { provider, send } = client(respond(sse(delta("Half"), { type: "error", error: { type: "overloaded_error" } })));
    const pieces: string[] = [];
    const error = await (async () => {
      for await (const piece of provider.stream(ask)) pieces.push(piece);
    })().catch((caught: unknown) => caught);
    expect(pieces).toEqual(["Half"]);
    expect((error as ClaudeError).failure).toBe("unavailable");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not retry a bad key, and says only that", async () => {
    const { provider, send } = client(respond('{"error":{"message":"invalid x-api-key"}}', 401));
    const error = await failure(provider.stream(ask));
    expect(error.failure).toBe("key");
    expect(send).toHaveBeenCalledTimes(1);
    expect(error.message).not.toContain(KEY);
  });

  it("does not retry a refused request", async () => {
    const { provider, send } = client(respond("{}", 400));
    expect((await failure(provider.stream(ask))).failure).toBe("request");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("retries a failed connection, without quoting the request", async () => {
    const { provider, send } = client(new Error(`fetch failed for ${KEY}`), respond(WHOLE));
    await collect(provider.stream(ask));
    expect(send).toHaveBeenCalledTimes(2);
    const { provider: down } = client(new Error(KEY), new Error(KEY), new Error(KEY));
    const error = await failure(down.stream(ask));
    expect(error.failure).toBe("unavailable");
    expect(error.message).not.toContain(KEY);
  });

  it("times out while waiting for the answer to start", async () => {
    const send = vi.fn(
      (_: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    const provider = createClaudeProvider({ apiKey: KEY, fetch: send as unknown as typeof fetch, sleep: async () => {}, timeoutMs: 5 });
    expect((await failure(provider.stream(ask))).failure).toBe("unavailable");
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("times out when a started answer goes quiet", async () => {
    const quiet = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse(delta("Half"))));
      },
    });
    const send = vi.fn(async () => new Response(quiet));
    const provider = createClaudeProvider({ apiKey: KEY, fetch: send as unknown as typeof fetch, sleep: async () => {}, timeoutMs: 5 });
    expect((await failure(provider.stream(ask))).failure).toBe("unavailable");
  });

  it("says when Claude declines, and when the answer was cut off or never finished", async () => {
    const refused = client(respond(sse(stop("refusal"))));
    expect((await failure(refused.provider.stream(ask))).failure).toBe("refused");
    const cut = client(respond(sse(delta("Half"), stop("max_tokens"))));
    expect((await failure(cut.provider.stream(ask))).failure).toBe("incomplete");
    const ended = client(respond(sse(delta("Half"))));
    expect((await failure(ended.provider.stream(ask))).failure).toBe("unavailable");
  });

  it("lets a call that asked for few tokens stop at them", async () => {
    const { provider } = client(respond(sse(delta("OK"), stop("max_tokens"))));
    expect((await provider.complete({ ...ask, maxTokens: 16 })).text).toBe("OK");
  });

  it("has no embeddings", async () => {
    const { provider } = client();
    expect(provider.embeddingModel).toBeNull();
    await expect(provider.embed(["x"])).rejects.toThrow();
  });
});
