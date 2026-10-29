import { getOwner, type Owner } from "@/lib/auth/owner";

// The editor's data routes are the owner's alone, like the editor: a
// visitor gets a 401 and nothing else.
export async function ownerOr401(): Promise<Owner | Response> {
  const owner = await getOwner();
  return owner ?? Response.json({ error: "Sign in to use the editor." }, { status: 401 });
}
