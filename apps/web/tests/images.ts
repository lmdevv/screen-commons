import { crc32, deflateSync } from "node:zlib";

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A real, decodable RGB PNG filled with a gradient-ish pattern seeded by `seed`. */
export function makePng(width: number, height: number, seed = 0): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour
  const row = width * 3 + 1;
  const raw = Buffer.alloc(row * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * row] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = y * row + 1 + x * 3;
      raw[offset] = (x + seed * 37) & 0xff;
      raw[offset + 1] = (y + seed * 91) & 0xff;
      raw[offset + 2] = (seed * 53) & 0xff;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

class BitWriter {
  private bytes: number[] = [];
  private current = 0;
  private used = 0;

  write(value: number, bits: number) {
    for (let index = 0; index < bits; index += 1) {
      this.current |= ((value >> index) & 1) << this.used;
      this.used += 1;
      if (this.used === 8) {
        this.bytes.push(this.current);
        this.current = 0;
        this.used = 0;
      }
    }
  }

  finish(): Buffer {
    if (this.used > 0) this.bytes.push(this.current);
    return Buffer.from(this.bytes);
  }
}

/**
 * A real, decodable lossless WebP (VP8L) of a single solid colour: every prefix code is a
 * one-symbol "simple" code, so pixels take zero bits.
 */
export function makeWebp(width: number, height: number, rgba = [24, 24, 27, 255]): Buffer {
  const [r, g, b, a] = rgba as [number, number, number, number];
  const bits = new BitWriter();
  bits.write(width - 1, 14);
  bits.write(height - 1, 14);
  bits.write(a === 255 ? 0 : 1, 1); // alpha_is_used
  bits.write(0, 3); // version
  bits.write(0, 1); // no transforms
  bits.write(0, 1); // no colour cache
  bits.write(0, 1); // no meta prefix codes
  for (const symbol of [g, r, b, a]) {
    bits.write(1, 1); // simple code
    bits.write(0, 1); // one symbol
    bits.write(1, 1); // 8-bit symbol
    bits.write(symbol, 8);
  }
  bits.write(1, 1); // distance: simple code
  bits.write(0, 1); // one symbol
  bits.write(0, 1); // 1-bit symbol
  bits.write(0, 1); // symbol 0
  const payload = Buffer.concat([Buffer.from([0x2f]), bits.finish()]);
  const padded = payload.length % 2 ? Buffer.concat([payload, Buffer.alloc(1)]) : payload;
  const vp8l = Buffer.alloc(8);
  vp8l.write("VP8L", 0, "ascii");
  vp8l.writeUInt32LE(payload.length, 4);
  const riff = Buffer.alloc(12);
  riff.write("RIFF", 0, "ascii");
  riff.writeUInt32LE(4 + vp8l.length + padded.length, 4);
  riff.write("WEBP", 8, "ascii");
  return Buffer.concat([riff, vp8l, padded]);
}
