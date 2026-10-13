import { getSetupToken } from "./secrets";

const globalForNotice = globalThis as typeof globalThis & { selahSetupTokenShown?: boolean };

// Prints the setup token to the server's log, once per process, the first
// time the setup screen needs it. The Docker entry point prints it at start
// (scripts/boot.ts); this covers `pnpm dev` and `pnpm start`.
export function announceSetupToken(): void {
  const token = getSetupToken();
  if (
    globalForNotice.selahSetupTokenShown ||
    process.env.SELAH_SETUP_TOKEN_SHOWN === "1" ||
    process.env.SELAH_SETUP_TOKEN?.trim()
  ) {
    return;
  }
  globalForNotice.selahSetupTokenShown = true;
  console.log(`Selah setup token: ${token}  (the setup screen at /setup asks for it)`);
}
