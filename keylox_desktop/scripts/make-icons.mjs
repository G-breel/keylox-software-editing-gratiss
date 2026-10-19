#!/usr/bin/env node
/**
 * Keylox — generator ikon aplikasi (Stage 9 / DevOps).
 *
 * Kenapa ada: `package.json` → `build.win.icon = assets/icon.ico`, tetapi
 * `assets/` tidak ada di repo. Tanpa ikon, `electron-builder` gagal
 * ("cannot find icon") dan rilis .exe tidak bisa dibuat.
 *
 * Skrip ini men-generate ikon secara DETERMINISTIK tanpa dependensi pihak
 * ketiga (hanya `node:zlib` bawaan), sehingga tidak ada biner opaque di repo
 * dan hasilnya reproducible di CI:
 *
 *   node scripts/make-icons.mjs         # tulis assets/icon.ico + assets/icon.png
 *
 * Format yang dihasilkan:
 *   - assets/icon.ico  : multi-resolusi 16/24/32/48/64/128/256 px, 32bpp BGRA
 *                        (DIB/BMP entry — paling kompatibel utk Windows &
 *                        electron-builder), supersampled 4x utk anti-alias.
 *   - assets/icon.png  : 512x512 RGBA (dipakai macOS/Linux; electron-builder
 *                        mengonversinya ke .icns/.png set saat build).
 *
 * CATATAN: ikon macOS `.icns` idealnya dibuat di mesin macOS
 * (`iconutil -c icns`). Di Windows, electron-builder memakai icon.png untuk
 * menghasilkan icns — belum diverifikasi di sini (lihat docs/superapp/07-pipeline.md).
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'assets');

/* ------------------------------------------------------------------ *
 * 1. Master raster (digambar sekali di resolusi tinggi, lalu di-downsample)
 * ------------------------------------------------------------------ */

const MASTER = 1024;      // kanvas master
const SS = 4;             // faktor supersampling
const HI = MASTER * SS;   // resolusi kerja

/** Palet brand Keylox. */
const BG_TOP = [17, 19, 32, 255];      // #111320
const BG_BOTTOM = [10, 10, 14, 255];   // #0a0a0e
const KEY_TOP = [56, 189, 248, 255];   // #38bdf8 (sky-400)
const KEY_BOTTOM = [99, 102, 241, 255]; // #6366f1 (indigo-500)
const RING = [148, 163, 184, 90];      // #94a3b8 @ 35%

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [
  Math.round(lerp(c1[0], c2[0], t)),
  Math.round(lerp(c1[1], c2[1], t)),
  Math.round(lerp(c1[2], c2[2], t)),
  Math.round(lerp(c1[3], c2[3], t)),
];

/** Signed distance ke rounded-rect (dipakai utk tepi halus & sudut membulat). */
function sdRoundedRect(x, y, cx, cy, halfW, halfH, r) {
  const qx = Math.abs(x - cx) - (halfW - r);
  const qy = Math.abs(y - cy) - (halfH - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Keyhole Keylox: cincin + bilah (stem) yang melebar ke bawah. */
function insideKeyhole(nx, ny) {
  const holeR = 0.155;
  const dHole = Math.hypot(nx - 0.5, ny - 0.40);
  if (dHole <= holeR) return true;

  const stemTop = 0.40;
  const stemBottom = 0.78;
  if (ny >= stemTop && ny <= stemBottom) {
    const t = (ny - stemTop) / (stemBottom - stemTop);
    const halfWidth = lerp(0.052, 0.105, t);
    return Math.abs(nx - 0.5) <= halfWidth;
  }
  return false;
}

function renderMaster() {
  const buf = new Uint8ClampedArray(HI * HI * 4); // RGBA master
  const cx = HI / 2;
  const cy = HI / 2;
  const plateHalf = HI * 0.5 - HI * 0.055; // margin ~5.5%
  const plateR = HI * 0.20;                // sudut membulat

  for (let y = 0; y < HI; y++) {
    const ny = y / HI;
    for (let x = 0; x < HI; x++) {
      const nx = x / HI;
      const i = (y * HI + x) * 4;

      // --- pelat latar (rounded square) dengan tepi anti-aliased ---
      const d = sdRoundedRect(x + 0.5, y + 0.5, cx, cy, plateHalf, plateHalf, plateR);
      const cover = Math.min(1, Math.max(0, 0.5 - d / SS)); // tepi ~1px master
      if (cover <= 0) { buf[i + 3] = 0; continue; }

      let px = mix(BG_TOP, BG_BOTTOM, ny);

      // --- cincin dekoratif tipis ---
      const dRing = Math.abs(Math.hypot(nx - 0.5, ny - 0.40) - 0.275);
      if (dRing < 0.012) px = mix(px, RING, 1 - dRing / 0.012);

      // --- keyhole ---
      if (insideKeyhole(nx, ny)) {
        const t = Math.min(1, Math.max(0, (ny - 0.22) / 0.56));
        px = mix(KEY_TOP, KEY_BOTTOM, t);
      }

      buf[i] = px[0];
      buf[i + 1] = px[1];
      buf[i + 2] = px[2];
      buf[i + 3] = Math.round(px[3] * cover);
    }
  }
  return buf;
}

/** Box-filter downsample HI -> size (alpha di-premultiply agar tepi bersih). */
function downsample(master, hi, size) {
  const out = new Uint8ClampedArray(size * size * 4);
  const f = hi / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      const y0 = Math.floor(y * f);
      const y1 = Math.min(hi, Math.ceil((y + 1) * f));
      const x0 = Math.floor(x * f);
      const x1 = Math.min(hi, Math.ceil((x + 1) * f));
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * hi + xx) * 4;
          const al = master[i + 3] / 255;
          r += master[i] * al; g += master[i + 1] * al; b += master[i + 2] * al;
          a += master[i + 3]; n++;
        }
      }
      const o = (y * size + x) * 4;
      const aAvg = a / n;
      const aw = aAvg / 255 || 1;
      out[o] = Math.round(r / n / aw);
      out[o + 1] = Math.round(g / n / aw);
      out[o + 2] = Math.round(b / n / aw);
      out[o + 3] = Math.round(aAvg);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 2. PNG encoder (RGBA, non-interlaced) — hanya node:zlib
 * ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type: truecolor + alpha
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: None (deterministik)
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride)
      .copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ *
 * 3. ICO encoder (entry DIB/BMP 32bpp, bottom-up, + AND mask)
 * ------------------------------------------------------------------ */

function dibEntry(rgba, size) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);            // biSize
  header.writeInt32LE(size, 4);           // biWidth
  header.writeInt32LE(size * 2, 8);       // biHeight (XOR + AND)
  header.writeUInt16LE(1, 12);            // biPlanes
  header.writeUInt16LE(32, 14);           // biBitCount
  header.writeUInt32LE(0, 16);            // BI_RGB
  const maskStride = Math.ceil(size / 32) * 4;
  header.writeUInt32LE(size * size * 4 + maskStride * size, 20); // biSizeImage
  // biXPelsPerMeter/biYPelsPerMeter/biClrUsed/biClrImportant = 0

  const xor = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const srcRow = (size - 1 - y) * size * 4; // bottom-up
    for (let x = 0; x < size; x++) {
      const s = srcRow + x * 4;
      const d = (y * size + x) * 4;
      xor[d] = rgba[s + 2];     // B
      xor[d + 1] = rgba[s + 1]; // G
      xor[d + 2] = rgba[s];     // R
      xor[d + 3] = rgba[s + 3]; // A
    }
  }
  // AND mask: 0 = piksel digambar (alpha kanal 32bpp yang menentukan).
  const and = Buffer.alloc(maskStride * size);
  return Buffer.concat([header, xor, and]);
}

function encodeIco(entries) {
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);              // reserved
  dir.writeUInt16LE(1, 2);              // type: icon
  dir.writeUInt16LE(entries.length, 4);

  const dirEntries = [];
  let offset = 6 + entries.length * 16;
  const blobs = [];
  for (const { size, data } of entries) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;      // 0 = 256
    e[1] = size >= 256 ? 0 : size;
    e[2] = 0;                            // colorCount
    e[3] = 0;                            // reserved
    e.writeUInt16LE(1, 4);               // planes
    e.writeUInt16LE(32, 6);              // bitCount
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    dirEntries.push(e);
    blobs.push(data);
    offset += data.length;
  }
  return Buffer.concat([dir, ...dirEntries, ...blobs]);
}

/* ------------------------------------------------------------------ *
 * 4. Main
 * ------------------------------------------------------------------ */

const master = renderMaster();
const SIZES = [16, 24, 32, 48, 64, 128, 256];

mkdirSync(ASSETS, { recursive: true });

const icoEntries = SIZES.map((size) => ({
  size,
  data: dibEntry(downsample(master, HI, size), size),
}));
const ico = encodeIco(icoEntries);
writeFileSync(join(ASSETS, 'icon.ico'), ico);

const png = encodePng(downsample(master, HI, 512), 512);
writeFileSync(join(ASSETS, 'icon.png'), png);

console.log(`icons: assets/icon.ico (${SIZES.join(',')} px, ${ico.length} B) di-generate.`);
console.log(`icons: assets/icon.png (512 px, ${png.length} B) di-generate.`);
