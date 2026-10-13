// Selah's mirror of the pinned source files. The publishers' URLs are not
// versioned, so a copy of each file exactly as it was pinned is attached to a
// data release of this repository (a GitHub release used only for data; see
// "Data releases" in the README). The imports download from there first and
// from the publisher second, and check whichever copy arrives against the
// same pin: the mirror is trusted no more than the publisher.

// The data release this version of the code is pinned against. Every pin in
// ./sources.ts and src/lib/study/sources.ts is satisfied by a file in it.
// Data releases are never changed once published: when a pin changes, publish
// a new one (`pnpm data:release`) and name it here, so that older versions of
// Selah keep finding the files their pins expect under the older tag.
export const DATA_RELEASE = "data-v1";

export const DATA_RELEASE_REPOSITORY = "mattsanchez/selah";

// Where the files of a data release are downloaded from.
export function dataReleaseUrl(tag: string = DATA_RELEASE): string {
  return `https://github.com/${DATA_RELEASE_REPOSITORY}/releases/download/${tag}`;
}

// The name of a pinned file in the download cache and in the mirror. It
// carries the start of the pin, so a file that is re-pinned gets a new name.
export function pinnedFileName(id: string, pin: string, extension: "json" | "zip"): string {
  return `${id}-${pin.slice(0, 12)}.${extension}`;
}

type Env = Record<string, string | undefined>;

// The mirror to download from, without a trailing slash, or undefined for
// none. SELAH_DATA_MIRROR overrides it: "off" downloads from the publishers
// only, and a URL names another mirror, which must serve each file under the
// name it has in the data release (for example a copy of the release's files
// on a server of the self-hoster's own).
export function mirrorUrl(env: Env = process.env): string | undefined {
  const value = env.SELAH_DATA_MIRROR?.trim();
  if (!value) return dataReleaseUrl();
  if (/^(off|none|false|0)$/i.test(value)) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`SELAH_DATA_MIRROR is not a URL or "off": "${value}"`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`SELAH_DATA_MIRROR must start with http:// or https://: "${value}"`);
  }
  return value.replace(/\/+$/, "");
}

// One place a pinned file can be downloaded from.
export type DownloadSource = { url: string; mirror: boolean };

// Where to download a pinned file from, in the order to try: the mirror
// first, unless there is none or the file is not in it, then the publisher.
export function downloadSources(
  file: { name: string; upstreamUrl: string; mirrored: boolean },
  mirror: string | undefined,
): DownloadSource[] {
  const upstream = { url: file.upstreamUrl, mirror: false };
  if (!mirror || !file.mirrored) return [upstream];
  return [{ url: `${mirror}/${file.name}`, mirror: true }, upstream];
}
