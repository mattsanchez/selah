import { crc32, inflateRawSync } from "node:zlib";

// A reader for the zip archives the publishers post their USFM files in. It
// reads files into memory and writes nothing to disk. Only what those
// archives use is supported: stored and deflated entries, no encryption, no
// zip64.

const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;
// No file of a Bible in USFM comes near this; it stops a malformed archive
// from filling memory.
const MAX_FILE_BYTES = 64 * 1024 * 1024;

// The files of an archive whose names pass `wanted`, by name.
export function readZip(
  bytes: Uint8Array,
  wanted: (name: string) => boolean = () => true,
): Map<string, Uint8Array> {
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // The directory's end record sits at the very end, before an optional comment.
  let end = data.length - 22;
  while (end >= 0 && data.readUInt32LE(end) !== END_OF_DIRECTORY) end--;
  if (end < 0) throw new Error("Not a zip archive");
  const count = data.readUInt16LE(end + 10);
  let at = data.readUInt32LE(end + 16);

  const files = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    if (at + 46 > data.length || data.readUInt32LE(at) !== DIRECTORY_ENTRY) {
      throw new Error("Corrupt zip archive: bad directory entry");
    }
    const flags = data.readUInt16LE(at + 8);
    const method = data.readUInt16LE(at + 10);
    const checksum = data.readUInt32LE(at + 16);
    const compressedSize = data.readUInt32LE(at + 20);
    const size = data.readUInt32LE(at + 24);
    const nameLength = data.readUInt16LE(at + 28);
    const extraLength = data.readUInt16LE(at + 30);
    const commentLength = data.readUInt16LE(at + 32);
    const header = data.readUInt32LE(at + 42);
    const name = data.toString("utf8", at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith("/") || !wanted(name)) continue;
    if (flags & 1) throw new Error(`Zip entry ${name} is encrypted`);
    if (size > MAX_FILE_BYTES) throw new Error(`Zip entry ${name} is too large`);
    if (header + 30 > data.length || data.readUInt32LE(header) !== LOCAL_HEADER) {
      throw new Error(`Corrupt zip archive: bad header for ${name}`);
    }
    const start =
      header + 30 + data.readUInt16LE(header + 26) + data.readUInt16LE(header + 28);
    const packed = data.subarray(start, start + compressedSize);

    let content: Uint8Array;
    if (method === 0) content = packed;
    else if (method === 8) content = inflateRawSync(packed, { maxOutputLength: MAX_FILE_BYTES });
    else throw new Error(`Zip entry ${name} uses unsupported compression ${method}`);
    if (content.length !== size || crc32(content) !== checksum) {
      throw new Error(`Corrupt zip archive: ${name} fails its checksum`);
    }
    files.set(name, content);
  }
  return files;
}
