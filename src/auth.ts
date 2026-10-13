import { and, eq } from "drizzle-orm";
import NextAuth, { CredentialsSignin, type NextAuthConfig } from "next-auth";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import Credentials from "next-auth/providers/credentials";
import type { EmailConfig } from "next-auth/providers/email";

import { getDb } from "@/db/client";
import { verificationToken } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { AttemptLimiter } from "@/lib/auth/rate-limit";
import { getMailer } from "@/lib/email";
import { emailConfig, magicLinkEnabled, publicUrl } from "@/lib/env";
import { findOwner, findOwnerByEmail, type OwnerRecord } from "@/lib/owner";
import { authSecret } from "@/lib/secrets";
import { normalizeEmail } from "@/lib/settings/validate";
import { getSiteTitle } from "@/lib/site";

// Auth.js configuration. Application code does not import this file: use
// getOwner and requireOwner from src/lib/auth/owner.ts.
//
// Sessions are encrypted cookies (JWT strategy), so they survive a restart as
// long as the install's secret does. The only account is the owner: nothing
// here can create a user.

export const MAGIC_LINK_MINUTES = 15;

// Ten wrong passwords for one email in fifteen minutes, then that email has
// to wait. Argon2 makes each guess slow; this makes them few.
const passwordFailures = new AttemptLimiter(10, 15 * 60_000);

export class TooManyAttempts extends CredentialsSignin {
  code = "too_many_attempts";
}

type SessionUser = AdapterUser & { sessionVersion: number };

const toUser = (owner: OwnerRecord): SessionUser => ({
  id: owner.id,
  email: owner.email,
  emailVerified: null,
  sessionVersion: owner.sessionVersion,
});

// What the magic-link flow needs from a database: find the owner by email,
// and keep the hashed tokens. Sessions are not stored, and no user is ever
// created or changed through it.
function ownerAdapter(): Adapter {
  const db = getDb();
  return {
    async getUserByEmail(email) {
      const owner = await findOwnerByEmail(db, normalizeEmail(email));
      return owner ? toUser(owner) : null;
    },
    async getUser(id) {
      const owner = await findOwner(db);
      return owner?.id === id ? toUser(owner) : null;
    },
    async updateUser({ id }) {
      // Called after a magic link is used, to record that the email is
      // verified. There is nothing to record; return the owner as they are.
      const owner = await findOwner(db);
      if (owner?.id !== id) throw new Error("No such user");
      return toUser(owner);
    },
    async createUser() {
      throw new Error("Selah has one account, created by the setup screen.");
    },
    async createVerificationToken(token) {
      // One live link at a time: asking for a new one cancels the old.
      await db
        .delete(verificationToken)
        .where(eq(verificationToken.identifier, token.identifier));
      await db.insert(verificationToken).values(token);
      return token;
    },
    async useVerificationToken({ identifier, token }) {
      const rows = await db
        .delete(verificationToken)
        .where(
          and(
            eq(verificationToken.identifier, identifier),
            eq(verificationToken.token, token),
          ),
        )
        .returning();
      return rows[0] ?? null;
    },
  };
}

function magicLinkProvider(): EmailConfig {
  const from = emailConfig()!.from;
  return {
    id: "email",
    type: "email",
    name: "Email",
    from,
    maxAge: MAGIC_LINK_MINUTES * 60,
    options: {},
    async sendVerificationRequest({ identifier, url }) {
      // The link, and the page it returns to, always point at the configured
      // public address, whatever host the request that asked for it named.
      const origin = new URL(publicUrl()!);
      const atPublicAddress = (value: string | URL) => {
        const moved = new URL(value, origin);
        moved.protocol = origin.protocol;
        moved.host = origin.host;
        return moved;
      };
      const link = atPublicAddress(url);
      const callbackUrl = link.searchParams.get("callbackUrl");
      if (callbackUrl) {
        link.searchParams.set("callbackUrl", atPublicAddress(callbackUrl).toString());
      }

      const title = await getSiteTitle();
      await getMailer()!.send({
        to: identifier,
        subject: `Sign in to ${title}`,
        text:
          `Open this link to sign in to ${title}:\n\n${link}\n\n` +
          `It works once and expires in ${MAGIC_LINK_MINUTES} minutes. ` +
          "If you did not ask for it, you can ignore this email.\n",
      });
    },
  };
}

function config(): NextAuthConfig {
  return {
    secret: authSecret(),
    // Without SELAH_URL the site answers on whatever host it is reached at.
    trustHost: true,
    session: { strategy: "jwt" },
    adapter: ownerAdapter(),
    pages: { signIn: "/sign-in", error: "/sign-in", verifyRequest: "/sign-in/check-email" },
    logger: {
      // A wrong password and a used-up link are everyday events: one line
      // each, no stack trace. Anything else is logged in full.
      error(error) {
        const type = (error as { type?: string }).type;
        if (type === "CredentialsSignin" || type === "Verification") {
          console.warn(`auth: sign-in refused (${type})`);
        } else {
          console.error(error);
        }
      },
    },
    providers: [
      Credentials({
        credentials: { email: {}, password: {} },
        async authorize(credentials) {
          const email = normalizeEmail(String(credentials.email ?? ""));
          const password = String(credentials.password ?? "");
          if (passwordFailures.blocked(email)) throw new TooManyAttempts();

          const owner = await findOwnerByEmail(getDb(), email);
          if (!(await verifyPassword(owner?.passwordHash, password)) || !owner) {
            passwordFailures.record(email);
            return null;
          }
          passwordFailures.reset(email);
          return toUser(owner);
        },
      }),
      ...(magicLinkEnabled() ? [magicLinkProvider()] : []),
    ],
    callbacks: {
      // Only the owner signs in, whichever provider vouches for them.
      async signIn({ user }) {
        const owner = await findOwner(getDb());
        return owner !== undefined && user.id === owner.id;
      },
      jwt({ token, user }) {
        if (user) {
          token.sub = user.id;
          token.sessionVersion = (user as SessionUser).sessionVersion;
        }
        return token;
      },
      session({ session, token }) {
        if (token.sub) session.user.id = token.sub;
        (session as { sessionVersion?: unknown }).sessionVersion = token.sessionVersion;
        return session;
      },
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth(config);
