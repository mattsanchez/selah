import { describe, expect, it } from "vitest";

import { ChecksumError, DownloadError } from "@/lib/bible/import/download";
import { BIBLE_SOURCES } from "@/lib/bible/import/sources";
import { StudyChecksumError } from "@/lib/study/import/download";
import { CROSS_REFERENCES } from "@/lib/study/sources";

import { describeImportFailure, withDownloadRetries } from "./imports";
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
    finish: async (id) => void Object.assign(find(id), { status: "done", message: null }),
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
