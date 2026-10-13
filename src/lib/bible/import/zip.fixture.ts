import { crc32, deflateRawSync } from "node:zlib";

// Builds a zip archive in memory for the tests: short files are stored, longer
// ones deflated, as in the publishers' archives.
export function zip(files: Record<string, string>): Uint8Array {
  const local: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;

  for (const [name, text] of Object.entries(files)) {
    const content = Buffer.from(text, "utf8");
    const method = content.length > 64 ? 8 : 0;
    const packed = method === 8 ? deflateRawSync(content) : content;
    const nameBytes = Buffer.from(name, "utf8");

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(method, 8);
    header.writeUInt32LE(crc32(content), 14);
    header.writeUInt32LE(packed.length, 18);
    header.writeUInt32LE(content.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt32LE(crc32(content), 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(content.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);

    local.push(header, nameBytes, packed);
    directory.push(entry, nameBytes);
    offset += 30 + nameBytes.length + packed.length;
  }

  const size = directory.reduce((n, part) => n + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...local, ...directory, end]));
}
