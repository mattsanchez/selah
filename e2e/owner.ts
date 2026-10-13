import path from "node:path";

export { TEST_OWNER, TEST_SITE } from "../src/db/seed/test-owner";

// The signed-in owner's browser state, written by owner.setup.ts before the
// journeys run. A spec (or a describe block) that needs the owner says:
//
//   test.use({ storageState: OWNER_STATE });
//
// Without it a test is a signed-out visitor.
export const OWNER_STATE = path.join("playwright", ".auth", "owner.json");
