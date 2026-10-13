// The owner the Playwright journeys sign in as, and the site settings they
// start from. Test data only: it is seeded when SELAH_SEED_TEST_OWNER=1 and
// never otherwise. Constants only, so the tests can import this file.

export const TEST_OWNER = {
  email: "owner@selah.test",
  password: "selah-fixture-owner-password",
} as const;

export const TEST_SITE = {
  title: "Selah",
  handle: "owner",
  defaultTranslationId: "bsb",
} as const;

export const TEST_OWNER_FLAG = "SELAH_SEED_TEST_OWNER";
