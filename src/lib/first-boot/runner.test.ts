import { describe, expect, it } from "vitest";

import {
  ChecksumError,
  DownloadError,
  SourcesFailedError,
} from "@/lib/bible/import/download";
import { BIBLE_SOURCES } from "@/lib/bible/import/sources";
import { StudyChecksumError } from "@/lib/study/import/download";
import { CROSS_REFERENCES } from "@/lib/study/sources";

import { describeImportFailure, describeOrigins, withDownloadRetries } from "./imports";
import {
  FirstBootError,
  runFirstBoot,
  type BootStep,
  type BootStepRow,
  type BootStepStore,
} from "./runner";
import { STALLED_AFTER_MS, summarizeFirstBoot } from "./status";

function memoryStore(initial: BootStepRow[] = []) {
  let rows = initial.map((row) => ({ ...row }));
  const find = (id: string) => rows.find((row) => row.id === id)!;
  const store: BootStepStore = {
    list: async () => rows.map((row) => ({ ...row })),
    register: async (steps, keepDone) => {
      rows = steps.map((step, position) => {
        const old = rows.find((row) => row.id === step.id);
        return old && keepDone.includes(step.id)
          ? { ...old, position, title: step.title }
          : {
              id: step.id,
              position,
              title: step.title,
              version: step.version,
              status: "pending",
              message: null,
              startedAt: null,
              finishedAt: null,
              heartbeatAt: new Date(),
            };
      });
    },
    start: async (id) => void Object.assign(find(id), { status: "running" }),
    finish: async (id, note) =>
      void Object.assign(find(id), { status: "done", message: note ?? null }),
    fail: async (id, message) => void Object.assign(find(id), { status: "failed", message }),
    heartbeat: async () => {},
  };
  return { store, rows: () => rows };
}

function step(id: string, calls: string[], fail?: Error, version = "v1"): BootStep {
  return {
    id,
    title: id.toUpperCase(),
    version,
    run: async () => {
      calls.push(id);
      if (fail) throw fail;
    },
  };
}

const quiet = { log: () => {} };

describe("runFirstBoot", () => {
  it("runs the steps in order and records them as done", async () => {
    const calls: string[] = [];
    const { store, rows } = memoryStore();
    const result = await runFirstBoot([step("a", calls), step("b", calls)], store, quiet);
    expect(calls).toEqual(["a", "b"]);
    expect(result).toEqual({ done: ["a", "b"], skipped: [], failed: [] });
    expect(rows().map((row) => [row.id, row.position, row.status])).toEqual([
      ["a", 0, "done"],
      ["b", 1, "done"],
    ]);
  });

  it("records where a step says its files came from", async () => {
    const { store, rows } = memoryStore();
    const noted: BootStep = {
      id: "a",
      title: "a",
      version: "1",
      run: async () => "Downloaded from the mirror at github.com.",
    };
    await runFirstBoot([noted], store, quiet);
    expect(rows()[0]).toMatchObject({
      status: "done",
      message: "Downloaded from the mirror at github.com.",
    });
  });

  it("records a failure with its message and still runs the later steps", async () => {
    const calls: string[] = [];
    const { store, rows } = memoryStore();
    const result = await runFirstBoot(
      [step("a", calls, new FirstBootError("The WEB was not loaded: host down.")), step("b", calls)],
      store,
      quiet,
    );
    expect(calls).toEqual(["a", "b"]);
    expect(result).toEqual({ done: ["b"], skipped: [], failed: ["a"] });
    expect(rows()[0]).toMatchObject({ status: "failed", message: "The WEB was not loaded: host down." });
  });

  it("adds how to retry to an error that does not say", async () => {
    const { store, rows } = memoryStore();
    await runFirstBoot([step("a", [], new Error("disk full"))], store, quiet);
    expect(rows()[0].message).toMatch(/^disk full\nRestart Selah to try again/);
  });

  it("on a restart, skips what is done and reruns what failed or was interrupted", async () => {
    const calls: string[] = [];
    const { store, rows } = memoryStore();
    await runFirstBoot([step("a", calls), step("b", calls, new Error("down")), step("c", calls)], store, quiet);
    // "c" was being worked on when the process was killed.
    Object.assign(rows()[2], { status: "running" });

    calls.length = 0;
    const result = await runFirstBoot([step("a", calls), step("b", calls), step("c", calls)], store, quiet);
    expect(calls).toEqual(["b", "c"]);
    expect(result).toEqual({ done: ["b", "c"], skipped: ["a"], failed: [] });
    expect(rows().every((row) => row.status === "done" && row.message === null)).toBe(true);
  });

  it("reruns a done step whose version changed, and forgets steps no longer listed", async () => {
    const calls: string[] = [];
    const { store, rows } = memoryStore();
    await runFirstBoot([step("a", calls), step("gone", calls)], store, quiet);

    calls.length = 0;
    await runFirstBoot([step("a", calls, undefined, "v2"), step("new", calls)], store, quiet);
    expect(calls).toEqual(["a", "new"]);
    expect(rows().map((row) => [row.id, row.version])).toEqual([
      ["a", "v2"],
      ["new", "v1"],
    ]);
  });

  it("refuses two steps with one id", async () => {
    const { store } = memoryStore();
    await expect(runFirstBoot([step("a", []), step("a", [])], store, quiet)).rejects.toThrow(/share the id/);
  });
});

describe("summarizeFirstBoot", () => {
  const now = new Date("2026-10-12T12:00:00Z");
  const row = (id: string, status: BootStepRow["status"], beatAgoMs = 0): BootStepRow => ({
    id,
    position: id.charCodeAt(0),
    title: id,
    status,
    version: "v1",
    message: status === "failed" ? "why" : null,
    startedAt: null,
    finishedAt: null,
    heartbeatAt: new Date(now.getTime() - beatAgoMs),
  });

  it("reports nothing recorded, running, done and failed", () => {
    expect(summarizeFirstBoot([], now).state).toBe("none");
    expect(summarizeFirstBoot([row("a", "done"), row("b", "running"), row("c", "pending")], now).state).toBe(
      "running",
    );
    expect(summarizeFirstBoot([row("a", "done"), row("b", "done")], now).state).toBe("done");
    expect(summarizeFirstBoot([row("a", "failed"), row("b", "done")], now).state).toBe("failed");
  });

  it("reports unfinished steps nobody is working on as stalled", () => {
    const stale = STALLED_AFTER_MS + 1;
    expect(summarizeFirstBoot([row("a", "done"), row("b", "running", stale)], now).state).toBe("stalled");
    expect(summarizeFirstBoot([row("a", "pending", stale)], now).state).toBe("stalled");
  });

  it("lists the steps in order with the failure message", () => {
    const { steps } = summarizeFirstBoot([row("b", "failed"), row("a", "done")], now);
    expect(steps).toEqual([
      { id: "a", title: "a", status: "done", message: null },
      { id: "b", title: "b", status: "failed", message: "why" },
    ]);
  });
});

describe("import failures", () => {
  const web = BIBLE_SOURCES.find((source) => source.id === "web")!;

  it("a failed download names the file and host and says how to retry", () => {
    const error = new DownloadError(web.downloadUrl, "HTTP 503");
    const { message } = describeImportFailure("The World English Bible", error);
    expect(message).toContain("The World English Bible was not loaded");
    expect(message).toContain(web.downloadUrl);
    expect(message).toContain("HTTP 503");
    expect(message).toContain("can reach bible.helloao.org");
    expect(message).toContain("docker compose restart app");
  });

  it("a checksum mismatch names the changed file and says retrying will not help", () => {
    const error = new ChecksumError(web, "0".repeat(64), web.formatting);
    const { message } = describeImportFailure("The World English Bible", error);
    expect(message).toContain(web.formatting!.downloadUrl);
    expect(message).toContain("ebible.org");
    expect(message).toContain("trying again will not help");
    expect(message).toContain("Upgrade Selah");
    expect(message).not.toContain("docker compose restart");
  });

  it("a study source that changed is reported the same way", () => {
    const error = new StudyChecksumError(CROSS_REFERENCES, "0".repeat(64));
    const { message } = describeImportFailure("The cross-reference data from OpenBible.info", error);
    expect(message).toContain("The cross-reference data from OpenBible.info was not loaded");
    expect(message).toContain(CROSS_REFERENCES.downloadUrl);
    expect(message).toContain("a.openbible.info");
    expect(message).toContain("trying again will not help");
    expect(message).toContain("Everything that did load keeps working");
    expect(message).not.toContain("docker compose restart");
  });

  const mirrorCopy = { url: "https://github.com/mattsanchez/selah/releases/download/data-v1/x.zip", mirror: true };
  const publisher = { url: CROSS_REFERENCES.downloadUrl, mirror: false };
  const unreachable = (url: string) => new DownloadError(url, "the host could not be reached: ECONNREFUSED");

  it("names both places when the mirror is down and the publisher's file changed", () => {
    const error = new SourcesFailedError([
      { ...mirrorCopy, error: unreachable(mirrorCopy.url) },
      { ...publisher, error: new StudyChecksumError(CROSS_REFERENCES, "0".repeat(64)) },
    ]);
    const { message } = describeImportFailure("The cross-reference data from OpenBible.info", error);
    expect(message).toContain("Selah's mirror (github.com): could not download");
    expect(message).toContain("the publisher (a.openbible.info): the file at");
    expect(message).toContain("has changed since this version of Selah was released");
    expect(message).toContain("can only load the mirror's copy");
    expect(message).toContain("can reach github.com");
    expect(message).toContain("docker compose restart app");
    expect(message).not.toContain("trying again will not help");
  });

  it("names both hosts when neither can be reached", () => {
    const error = new SourcesFailedError([
      { ...mirrorCopy, error: unreachable(mirrorCopy.url) },
      { ...publisher, error: unreachable(publisher.url) },
    ]);
    const { message } = describeImportFailure("The cross references", error);
    expect(message).toContain("can reach github.com or a.openbible.info");
    expect(message).toContain("docker compose restart app");
  });

  it("says retrying will not help when no place has the pinned file", () => {
    const error = new SourcesFailedError([
      { ...mirrorCopy, error: new StudyChecksumError(CROSS_REFERENCES, "0".repeat(64), mirrorCopy) },
      { ...publisher, error: new StudyChecksumError(CROSS_REFERENCES, "0".repeat(64)) },
    ]);
    const { message } = describeImportFailure("The cross references", error);
    expect(message).toContain("is not the file this version of Selah was released with");
    expect(message).toContain("trying again will not help");
    expect(message).not.toContain("docker compose restart");
  });

  it("says where a step's files came from", () => {
    const fromMirror = { cached: false, from: mirrorCopy, failures: [] };
    expect(describeOrigins([fromMirror, fromMirror])).toBe("Downloaded from the mirror at github.com.");
    expect(
      describeOrigins([
        { cached: false, from: publisher, failures: [{ ...mirrorCopy, error: unreachable(mirrorCopy.url) }] },
      ]),
    ).toBe("Downloaded from a.openbible.info. Tried the mirror at github.com first, without success.");
    expect(describeOrigins([{ cached: true, failures: [] }])).toBe("From files downloaded earlier.");
  });

  it("retries while a place that could not be reached may still have the file", async () => {
    let tries = 0;
    const mirrorDown = async () => {
      tries++;
      throw new SourcesFailedError([
        { ...mirrorCopy, error: unreachable(mirrorCopy.url) },
        { ...publisher, error: new StudyChecksumError(CROSS_REFERENCES, "0".repeat(64)) },
      ]);
    };
    await expect(withDownloadRetries(mirrorDown, { delayMs: 0, log: () => {} })).rejects.toThrow(
      SourcesFailedError,
    );
    expect(tries).toBe(3);
  });

  it("any other failure keeps its reason and says how to retry", () => {
    const { message } = describeImportFailure("The KJV", new Error("connection refused"));
    expect(message).toMatch(/^The KJV was not loaded: connection refused\nRestart Selah/);
  });

  it("retries a failed download, but not a changed file", async () => {
    let tries = 0;
    const flaky = async () => {
      if (++tries < 3) throw new DownloadError("https://example.test/x", "HTTP 502");
      return "ok";
    };
    expect(await withDownloadRetries(flaky, { delayMs: 0, log: () => {} })).toBe("ok");
    expect(tries).toBe(3);

    tries = 0;
    const down = async () => {
      tries++;
      throw new DownloadError("https://example.test/x", "HTTP 502");
    };
    await expect(withDownloadRetries(down, { delayMs: 0, log: () => {} })).rejects.toThrow(DownloadError);
    expect(tries).toBe(3);

    tries = 0;
    const changed = async () => {
      tries++;
      throw new ChecksumError(web, "0".repeat(64));
    };
    await expect(withDownloadRetries(changed, { delayMs: 0, log: () => {} })).rejects.toThrow(ChecksumError);
    expect(tries).toBe(1);
  });
});
