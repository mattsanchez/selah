import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { dataDir, emailConfig, type EmailConfig } from "@/lib/env";

// The one place email leaves the app. SMTP when configured; a stub for tests
// that writes each message to a file and sends nothing.

export type Message = { to: string; subject: string; text: string };
export type Mailer = { send(message: Message): Promise<void> };

// Where the stub writes, one JSON file per message.
export function outboxDir(): string {
  return path.join(dataDir(), "outbox");
}

function stubMailer(from: string): Mailer {
  let count = 0;
  return {
    async send(message) {
      const dir = outboxDir();
      await mkdir(dir, { recursive: true });
      const name = `${Date.now()}-${process.pid}-${count++}.json`;
      await writeFile(path.join(dir, name), JSON.stringify({ from, ...message }, null, 2), {
        mode: 0o600,
      });
    },
  };
}

function smtpMailer(url: string, from: string): Mailer {
  return {
    async send(message) {
      const { createTransport } = await import("nodemailer");
      await createTransport(url).sendMail({ from, ...message });
    },
  };
}

// Undefined when the install has no way to send email.
export function getMailer(config: EmailConfig | undefined = emailConfig()): Mailer | undefined {
  if (!config) return undefined;
  return config.transport === "stub"
    ? stubMailer(config.from)
    : smtpMailer(config.url, config.from);
}
