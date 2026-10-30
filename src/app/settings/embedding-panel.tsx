"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { FormMessage } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { EmbeddingStatus } from "@/lib/embeddings/job";

import { startEmbeddingAction } from "./actions";

const REFRESH_MS = 3_000;

const number = (value: number) => value.toLocaleString("en");

function summary({ state, embedded, total }: EmbeddingStatus): string {
  const of = `${number(embedded)} of ${number(total)} passages embedded`;
  if (state === "running") return total > 0 ? `Embedding: ${of}.` : "Starting…";
  if (state === "done") return `All ${number(total)} passages are embedded. Search by meaning and related passages are on.`;
  if (state === "stalled") return `The run stopped before it finished: ${of}.`;
  if (embedded === 0) {
    return `${number(total)} passages to embed. The BSB and the WEB together are about 4 million tokens: about $0.25, inside Voyage AI's free allowance.`;
  }
  return `${of}.`;
}

// How far the install is with embedding the Bible, and the button that starts
// or continues it. While a run works the page reads its progress again every
// few seconds.
export function EmbeddingPanel({ status }: { status: EmbeddingStatus }) {
  const router = useRouter();
  const running = status.state === "running";
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [running, router]);

  if (status.state === "off") {
    return (
      <p data-embedding-state="off" className="text-sm text-stone-600 dark:text-stone-400">
        Add a Voyage AI key above to search the Bible and your own writing by meaning, and to find
        related passages. Keyword search works without one.
      </p>
    );
  }
  return (
    <div data-embedding-state={status.state} className="space-y-3">
      <p role={running ? "status" : undefined} className="text-sm text-stone-600 dark:text-stone-400">
        {summary(status)}
      </p>
      {running && status.total > 0 && (
        <progress value={status.embedded} max={status.total} aria-label="Passages embedded" className="w-full" />
      )}
      {status.message && <FormMessage kind="error">{status.message}</FormMessage>}
      {!running && status.state !== "done" && (
        <form action={startEmbeddingAction}>
          <SubmitButton>{status.embedded === 0 ? "Start" : "Continue"}</SubmitButton>
        </form>
      )}
    </div>
  );
}
