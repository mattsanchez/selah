// A link as typed: an address on the web (https:// is added when only the
// host is typed), an email address, or a path on this site.
export function linkHref(typed: string): string | undefined {
  const text = typed.trim();
  if (!text) return undefined;
  if (/^(https?:\/\/|mailto:)/i.test(text)) return text;
  if (/^\/(?!\/)/.test(text) || text.startsWith("#")) return text;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return `mailto:${text}`;
  if (/^[^\s/:]+\.[^\s/:]{2,}(\/\S*)?$/.test(text)) return `https://${text}`;
  return undefined;
}
