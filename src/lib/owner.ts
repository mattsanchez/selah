import { and, eq, sql } from "drizzle-orm";

import type { Db } from "@/db/client";
import { site, user } from "@/db/schema";

import { hashPassword } from "./auth/password";
import type { SiteSettings } from "./site-settings";

// The owner: the one account of an install. Created once, by the setup
// screen (or the test fixture), together with the site's settings.

export type Owner = { id: string; email: string };
export type OwnerRecord = Owner & { passwordHash: string; sessionVersion: number };

export type NewOwner = {
  email: string;
  password: string;
  site: {
    title: string;
    handle: string;
    defaultTranslationId: string;
    settings: SiteSettings;
  };
};

// Where createOwner writes. The database implementation is ownerStore below;
// tests pass a fake.
export type OwnerStore = {
  ownerExists(): Promise<boolean>;
  // Inserts the owner and the site settings as one unit, unless an owner
  // already exists, in which case it changes nothing and returns false.
  insertOwnerAndSite(
    owner: { email: string; passwordHash: string },
    siteValues: NewOwner["site"],
  ): Promise<boolean>;
};

export type CreateOwnerResult = "created" | "owner-exists";

// Creates the owner unless there is one. The early check saves hashing a
// password for nothing; the guarantee is the store's insert, which must be
// atomic, so two requests that both pass the check cannot both succeed.
export async function createOwner(
  store: OwnerStore,
  input: NewOwner,
  hash: (password: string) => Promise<string> = hashPassword,
): Promise<CreateOwnerResult> {
  if (await store.ownerExists()) return "owner-exists";
  const passwordHash = await hash(input.password);
  const created = await store.insertOwnerAndSite(
    { email: input.email, passwordHash },
    input.site,
  );
  return created ? "created" : "owner-exists";
}

const ownerColumns = {
  id: user.id,
  email: user.email,
  passwordHash: user.passwordHash,
  sessionVersion: user.sessionVersion,
};

export async function findOwner(db: Db): Promise<OwnerRecord | undefined> {
  const rows = await db.select(ownerColumns).from(user).where(eq(user.role, "owner")).limit(1);
  return rows[0];
}

export async function findOwnerByEmail(db: Db, email: string): Promise<OwnerRecord | undefined> {
  const rows = await db
    .select(ownerColumns)
    .from(user)
    .where(and(eq(user.role, "owner"), eq(user.email, email)))
    .limit(1);
  return rows[0];
}

export async function ownerExists(db: Db): Promise<boolean> {
  const rows = await db.select({ one: sql`1` }).from(user).where(eq(user.role, "owner")).limit(1);
  return rows.length > 0;
}

export function ownerStore(db: Db): OwnerStore {
  return {
    ownerExists: () => ownerExists(db),
    insertOwnerAndSite: (owner, siteValues) =>
      db.transaction(async (tx) => {
        // The unique index user_single_owner_idx decides a race: a second
        // insert waits for the first to commit, then conflicts and inserts
        // nothing.
        const inserted = await tx
          .insert(user)
          .values({ ...owner, role: "owner" })
          .onConflictDoNothing()
          .returning({ id: user.id });
        if (inserted.length === 0) return false;
        await tx
          .insert(site)
          .values({ id: 1, ...siteValues })
          .onConflictDoUpdate({
            target: site.id,
            set: { ...siteValues, updatedAt: sql`now()` },
          });
        return true;
      }),
  };
}

// Replaces the owner's password and signs out every existing session.
export async function setOwnerPassword(db: Db, password: string): Promise<boolean> {
  const passwordHash = await hashPassword(password);
  const updated = await db
    .update(user)
    .set({ passwordHash, sessionVersion: sql`${user.sessionVersion} + 1` })
    .where(eq(user.role, "owner"))
    .returning({ id: user.id });
  return updated.length > 0;
}
