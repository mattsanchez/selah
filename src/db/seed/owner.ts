import { eq, sql } from "drizzle-orm";

import { site, user } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOwner, findOwner, ownerStore } from "@/lib/owner";

import type { SeedStep } from "./fixture";
import { TEST_OWNER, TEST_SITE } from "./test-owner";

// Creates the known test owner, or puts an existing one back to the known
// password and site settings. Refuses to touch a database that someone else
// owns, so it cannot overwrite a real install's account.
export const testOwnerStep: SeedStep = {
  name: `Test owner (${TEST_OWNER.email})`,
  run: async (db) => {
    const siteValues = { ...TEST_SITE, settings: {} };
    const created = await createOwner(ownerStore(db), { ...TEST_OWNER, site: siteValues });
    if (created === "created") return;

    const owner = await findOwner(db);
    if (owner?.email !== TEST_OWNER.email) {
      throw new Error(
        "This database already has an owner who is not the test owner; not changing it. " +
          "Seed the test owner into a database of its own.",
      );
    }
    await db.transaction(async (tx) => {
      await tx
        .update(user)
        .set({ passwordHash: await hashPassword(TEST_OWNER.password) })
        .where(eq(user.id, owner.id));
      await tx
        .insert(site)
        .values({ id: 1, ...siteValues })
        .onConflictDoUpdate({ target: site.id, set: { ...siteValues, updatedAt: sql`now()` } });
    });
  },
};
