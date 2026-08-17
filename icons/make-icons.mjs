/* Regenerates the extension icons. Zero dependencies — writes PNGs by hand.
 *
 *   node icons/make-icons.mjs
 *
 * You never need to run this to use the extension; the PNGs are committed.
 * It exists so the artwork is reproducible if you want to recolour it. */

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SIZES = [16, 32, 48, 128];
const SUPERSAMPLE = 8;

/* The RSVP line in miniature: two dim context bars, one red pivot. */
const SHAPES = [
  { rect: [0.000, 0.000, 1.000, 1.000], radius: 0.220, colour: [0x15, 0x18, 0x1d] },
  { rect: [0.125, 0.452, 0.405, 0.548], radius: 0.048, colour: [0x8b, 0x93, 0xa1] },
  { rect: [0.595, 0.452, 0.875, 0.548], radius: 0.048, colour: [0x8b, 0x93, 0xa1] },
  { rect: [0.452, 0.245, 0.548, 0.755], radius: 0.048, colour: [0xe5, 0x48, 0x4d] }
];

/* ------------------------------------------------------------- PNG writer */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // colour type: RGBA
  ihdr[10] = 0;   // deflate
  ihdr[11] = 0;   // adaptive filtering
  ihdr[12] = 0;   // no interlace

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;   // filter type "none"
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* --------------------------------------------------------------- renderer */

function insideRoundRect(x, y, [x0, y0, x1, y1], radius) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const r = Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2);
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function render(size) {
  const out = Buffer.alloc(size * size * 4);
  const samples = SUPERSAMPLE * SUPERSAMPLE;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, covered = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const u = (x + (sx + 0.5) / SUPERSAMPLE) / size;
          const v = (y + (sy + 0.5) / SUPERSAMPLE) / size;

          let colour = null;
          for (const shape of SHAPES) {
            if (insideRoundRect(u, v, shape.rect, shape.radius)) colour = shape.colour;
          }
          if (colour) {
            r += colour[0];
            g += colour[1];
            b += colour[2];
            covered++;
          }
        }
      }

      const i = (y * size + x) * 4;
      if (covered) {
        out[i] = Math.round(r / covered);
        out[i + 1] = Math.round(g / covered);
        out[i + 2] = Math.round(b / covered);
        out[i + 3] = Math.round((covered / samples) * 255);
      }
    }
  }

  return out;
}

for (const size of SIZES) {
  const file = join(HERE, `icon${size}.png`);
  writeFileSync(file, encodePng(size, render(size)));
  console.log(`wrote icon${size}.png`);
}
