/* Regenerates the extension icons. Zero dependencies — writes PNGs by hand.
 *
 *   node icons/make-icons.mjs
 *
 * You never need to run this to use the extension; the PNGs are committed.
 * It exists so the artwork is reproducible if you want to recolour it.
 *
 * Padding. Each size carries its own transparent margin, in pixels. The
 * Chrome Web Store asks for the 128×128 icon to be 96×96 artwork with 16 px
 * of transparent padding on every side
 * (https://developer.chrome.com/docs/webstore/images#icons), so it sits at
 * the same visual weight as every other extension in the store listing (and
 * Chrome's install prompt) — a full-bleed square looks oversized next to them.
 * The 16/32 toolbar/menu sizes and the 48 used on chrome://extensions are
 * small enough that every pixel counts, and Chrome adds its own spacing
 * around them, so they stay full-bleed.
 *
 * Halo. The tile (#15181d) is all but invisible on a dark page — about 1.1:1
 * against Chrome's dark surface #202124 — so in the store's dark theme the
 * bars would float with no tile around them. The same page asks for the 128
 * to work on light and dark backgrounds and suggests a subtle white outer
 * glow for dark icons, so a padded size can ask for a ring of faint white
 * just outside the tile, inside the margin. White on white vanishes, so light
 * backgrounds look exactly as before. Full-bleed sizes have no outside to put
 * it in, and so never get one.
 *
 * SHAPES are drawn in artwork space, [0, 1] across the unpadded box; the
 * renderer maps each sample into that box, so the margin misses every shape
 * except the halo and stays fully transparent beyond it. A padding of 0 is
 * the identity, so the 16/32/48 sizes come out byte-for-byte as before. */

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SIZES = [
  { size: 16,  padding: 0 },
  { size: 32,  padding: 0 },
  { size: 48,  padding: 0 },
  { size: 128, padding: 16, halo: 1 }   // store listing: 96×96 artwork, 16 px margin
];
const SUPERSAMPLE = 8;

/* 1 px at this alpha lifts #202124 to about #3b3c3f: enough to trace the
 * tile's outline in the dark theme without reading as a border. */
const HALO = { colour: [0xff, 0xff, 0xff], alpha: 0.12 };

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

/* Maps a sample position in canvas pixels to artwork space, where the
 * unpadded box spans [0, 1]. Samples in the margin land outside [0, 1] and so
 * outside every shape in SHAPES (the background square is exactly [0, 1]);
 * only a halo reaches past it. */
function toArtwork(pixel, size, padding) {
  return (pixel - padding) / (size - 2 * padding);
}

/* The shape list for one size: SHAPES as they are, or with the halo slid
 * underneath. The halo is the tile grown outward by `halo` canvas pixels; an
 * offset of a rounded square is a rounded square with the radius grown by the
 * same amount, so the ring is an even width all the way round. The tile is
 * drawn over it and wins inside, which leaves only the ring showing. */
function shapesFor({ size, padding, halo = 0 }) {
  if (!halo) return SHAPES;
  const grow = halo / (size - 2 * padding);   // canvas px → artwork units
  const [tile] = SHAPES;
  const [x0, y0, x1, y1] = tile.rect;
  return [
    { rect: [x0 - grow, y0 - grow, x1 + grow, y1 + grow], radius: tile.radius + grow, ...HALO },
    ...SHAPES
  ];
}

/* Each sample takes the colour of the topmost shape it hits, weighted by that
 * shape's alpha, and the pixel is the premultiplied average of its samples.
 * There is no compositing of one shape over another, so a translucent shape
 * is only right over nothing — which is where the halo sits. With every alpha
 * at 1 the sums are the same integers as a plain coverage count, so opaque
 * pixels come out exactly as they did before alpha existed. */
function render(icon) {
  const { size, padding } = icon;
  const shapes = shapesFor(icon);
  const out = Buffer.alloc(size * size * 4);
  const samples = SUPERSAMPLE * SUPERSAMPLE;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, covered = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const u = toArtwork(x + (sx + 0.5) / SUPERSAMPLE, size, padding);
          const v = toArtwork(y + (sy + 0.5) / SUPERSAMPLE, size, padding);

          let top = null;
          for (const shape of shapes) {
            if (insideRoundRect(u, v, shape.rect, shape.radius)) top = shape;
          }
          if (top) {
            const alpha = top.alpha ?? 1;
            r += top.colour[0] * alpha;
            g += top.colour[1] * alpha;
            b += top.colour[2] * alpha;
            covered += alpha;
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

for (const icon of SIZES) {
  const file = join(HERE, `icon${icon.size}.png`);
  writeFileSync(file, encodePng(icon.size, render(icon)));
  console.log(`wrote icon${icon.size}.png`);
}
