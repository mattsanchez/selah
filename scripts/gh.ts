import { execFile } from "node:child_process";

import type { Gh } from "../src/lib/data-release/publish";

// Runs the `gh` CLI with whatever credentials it already has.
export const gh: Gh = (args) =>
  new Promise((resolve) => {
    execFile("gh", args, { maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === "number" ? error.code : 1) : 0;
      resolve({ code, stdout, stderr: stderr || (error ? error.message : "") });
    });
  });
