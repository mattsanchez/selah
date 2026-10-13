import { describe, expect, it, vi } from "vitest";

import { createOwner, type NewOwner, type OwnerStore } from "./owner";

const input = (email: string): NewOwner => ({
  email,
  password: "a long enough password",
  site: { title: "Selah", handle: "matt", defaultTranslationId: "bsb", settings: {} },
});

// A store that behaves like the database: the insert is atomic and refuses a
// second owner, whatever the earlier check said.
function fakeStore({ checkSees }: { checkSees?: boolean } = {}) {
  const owners: { email: string; passwordHash: string }[] = [];
  const sites: NewOwner["site"][] = [];
  const store: OwnerStore = {
    ownerExists: async () => checkSees ?? owners.length > 0,
    insertOwnerAndSite: async (owner, site) => {
      if (owners.length > 0) return false;
      owners.push(owner);
      sites.push(site);
      return true;
    },
  };
  return { store, owners, sites };
}

const hash = async (password: string) => `hashed:${password.length}`;

describe("createOwner", () => {
  it("creates the owner and the site settings, storing a hash", async () => {
    const { store, owners, sites } = fakeStore();
    expect(await createOwner(store, input("matt@example.org"), hash)).toBe("created");
    expect(owners).toEqual([{ email: "matt@example.org", passwordHash: "hashed:22" }]);
    expect(JSON.stringify(owners)).not.toContain("a long enough password");
    expect(sites).toEqual([input("x").site]);
  });

  it("refuses once an owner exists, without hashing or writing", async () => {
    const { store, owners } = fakeStore();
    await createOwner(store, input("first@example.org"), hash);

    const hashSpy = vi.fn(hash);
    const insert = vi.spyOn(store, "insertOwnerAndSite");
    insert.mockClear();
    expect(await createOwner(store, input("second@example.org"), hashSpy)).toBe("owner-exists");
    expect(hashSpy).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(owners.map((owner) => owner.email)).toEqual(["first@example.org"]);
  });

  it("lets only one of two racing requests create the owner", async () => {
    // Both requests check before either has inserted, so both pass the check.
    const { store, owners } = fakeStore({ checkSees: false });
    const results = await Promise.all([
      createOwner(store, input("a@example.org"), hash),
      createOwner(store, input("b@example.org"), hash),
    ]);
    expect(results.sort()).toEqual(["created", "owner-exists"]);
    expect(owners).toHaveLength(1);
  });

  it("many racing requests still leave one owner", async () => {
    const { store, owners } = fakeStore({ checkSees: false });
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => createOwner(store, input(`u${i}@example.org`), hash)),
    );
    expect(results.filter((result) => result === "created")).toHaveLength(1);
    expect(owners).toHaveLength(1);
  });
});
