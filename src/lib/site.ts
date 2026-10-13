// Site-wide settings. Until the owner account and site settings exist (M6),
// these are constants; M6 replaces the body of each function with a read of
// the `site` row.

// The translation the reader shows when the URL names none.
export async function getDefaultTranslationId(): Promise<string> {
  return "bsb";
}
