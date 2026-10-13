"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { signIn, signOut } from "@/auth";
import { getDb } from "@/db/client";
import { safeNextPath } from "@/lib/auth/owner";
import { AttemptLimiter } from "@/lib/auth/rate-limit";
import { magicLinkEnabled } from "@/lib/env";
import { findOwnerByEmail } from "@/lib/owner";
import { normalizeEmail } from "@/lib/settings/validate";

export type SignInState = { error?: string; email?: string };

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

export async function signInAction(_: SignInState, form: FormData): Promise<SignInState> {
  const email = text(form, "email");
  try {
    await signIn("credentials", {
      email,
      password: text(form, "password"),
      redirectTo: safeNextPath(text(form, "next")),
    });
  } catch (error) {
    // A successful sign-in leaves by throwing a redirect; let that through.
    if (!(error instanceof AuthError)) throw error;
    const tooMany = "code" in error && error.code === "too_many_attempts";
    return {
      email,
      error: tooMany
        ? "Too many wrong passwords for this email. Wait fifteen minutes and try again."
        : "That email and password do not match.",
    };
  }
  return {};
}

// At most three sign-in emails per address in fifteen minutes, so the form
// cannot be used to fill the owner's inbox.
const linkRequests = new AttemptLimiter(3, 15 * 60_000);

// Emails the owner a sign-in link. Says the same thing whoever asks, so the
// form does not reveal which address is the owner's.
export async function magicLinkAction(form: FormData): Promise<void> {
  if (!magicLinkEnabled()) redirect("/sign-in");
  let email = "";
  try {
    email = normalizeEmail(text(form, "email"));
  } catch {
    // Not a string that can be normalized; treated like any unknown address.
  }
  if (email && !linkRequests.blocked(email) && (await findOwnerByEmail(getDb(), email))) {
    linkRequests.record(email);
    await signIn("email", {
      email,
      redirect: false,
      redirectTo: safeNextPath(text(form, "next")),
    });
  }
  redirect("/sign-in/check-email");
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
