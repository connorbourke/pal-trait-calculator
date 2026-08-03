#!/usr/bin/env node
/**
 * Quantize scripts/pet-sources/eidrolon-draft.png → public/pets/eidrolon.png
 * Hard nearest-neighbor downsample + limited palette + bg knockout.
 */
import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const srcPath = join(root, "scripts/pet-sources/eidrolon-draft.png");
const outPath = join(root, "public/pets/eidrolon.png");

function crcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}
const CRC = crcTable();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function readPng(buf) {
  if (buf.toString("hex", 0, 8) !== "89504e470d0a1a0a") throw new Error("not png");
  let pos = 8;
  let w = 0;
  let h = 0;
  let ct = 6;
  const idats = [];
  while (pos < buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + length);
    pos += 12 + length;
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      ct = data[9];
    } else if (type === "IDAT") idats.push(data);
    else if (type === "IEND") break;
  }
  const raw = inflateSync(Buffer.concat(idats));
  const bpp = { 2: 3, 6: 4 }[ct];
  if (!bpp) throw new Error(`unsupported color type ${ct}`);
  const stride = w * bpp;
  const rows = [];
  let i = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filt = raw[i++];
    const row = Buffer.from(raw.subarray(i, i + stride));
    i += stride;
    if (filt === 1) {
      for (let x = bpp; x < stride; x++) row[x] = (row[x] + row[x - bpp]) & 255;
    } else if (filt === 2) {
      for (let x = 0; x < stride; x++) row[x] = (row[x] + prev[x]) & 255;
    } else if (filt === 3) {
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? row[x - bpp] : 0;
        row[x] = (row[x] + ((a + prev[x]) >> 1)) & 255;
      }
    } else if (filt === 4) {
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? row[x - bpp] : 0;
        const b = prev[x];
        const c = x >= bpp ? prev[x - bpp] : 0;
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        row[x] = (row[x] + pr) & 255;
      }
    }
    const rgba = Buffer.alloc(w * 4);
    if (ct === 6) row.copy(rgba);
    else {
      for (let x = 0; x < w; x++) {
        rgba[x * 4] = row[x * 3];
        rgba[x * 4 + 1] = row[x * 3 + 1];
        rgba[x * 4 + 2] = row[x * 3 + 2];
        rgba[x * 4 + 3] = 255;
      }
    }
    rows.push(rgba);
    prev = row;
  }
  return { w, h, rows };
}

function writePng(path, w, h, rows) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (w * 4 + 1);
    raw[o] = 0;
    rows[y].copy(raw, o + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  writeFileSync(
    path,
    Buffer.concat([
      sig,
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

// White / black / cyan Eidrolon palette (matches idle identity)
const PALETTE = [
  [0, 0, 0, 0],
  [8, 8, 12, 255], // outline
  [18, 18, 24, 255], // deep black
  [36, 38, 48, 255], // charcoal body
  [58, 62, 74, 255], // mid grey
  [168, 176, 188, 255], // pale grey
  [220, 226, 234, 255], // near-white body
  [245, 248, 252, 255], // bright white
  [40, 210, 235, 255], // cyan mid
  [70, 235, 255, 255], // cyan bright
  [20, 140, 170, 255], // cyan deep
  [140, 245, 255, 255], // cyan glow
];

function dist(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

function pixel(rows, y, x) {
  const i = x * 4;
  return [rows[y][i], rows[y][i + 1], rows[y][i + 2], rows[y][i + 3]];
}

function isColorful(p) {
  if (p[3] < 40) return false;
  if (p[0] > 80 || p[1] > 80 || p[2] > 80) return true;
  return p[2] > p[0] + 20 && p[2] > 60;
}

function isBg(p) {
  if (p[3] < 40) return true;
  // solid black draft backgrounds
  return p[0] < 18 && p[1] < 18 && p[2] < 22;
}

if (!existsSync(srcPath)) {
  console.error("Missing", srcPath);
  process.exit(1);
}

const { w, h, rows } = readPng(readFileSync(srcPath));
let minx = w;
let miny = h;
let maxx = 0;
let maxy = 0;
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const p = pixel(rows, y, x);
    if (!isBg(p)) {
      minx = Math.min(minx, x);
      maxx = Math.max(maxx, x);
      miny = Math.min(miny, y);
      maxy = Math.max(maxy, y);
    }
  }
}
// Tight crop; fit HEIGHT first so Eidrolon matches Sekhmet's tall presence
const pad = 2;
minx = Math.max(0, minx - pad);
miny = Math.max(0, miny - pad);
maxx = Math.min(w - 1, maxx + pad);
maxy = Math.min(h - 1, maxy + pad);
const cw = maxx - minx + 1;
const ch = maxy - miny + 1;
// Height-first; width follows aspect (flexible, not forced square)
const outH = 96;
const tw = Math.max(52, Math.min(112, Math.round((cw * outH) / ch)));
const th = outH;

function nearestPalette(p) {
  if (p[3] < 80 || isBg(p)) return PALETTE[0];
  const isCyan =
    p[2] > p[0] + 25 && p[1] > p[0] + 10 && p[2] > 120 && p[1] > 90;
  if (isCyan) {
    const cyanOnly = PALETTE.filter(
      (c) => c[3] > 0 && c[2] > c[0] + 20 && c[1] > 100,
    );
    return cyanOnly.reduce((a, b) => (dist(p, a) < dist(p, b) ? a : b));
  }
  return PALETTE.slice(1).reduce((a, b) => (dist(p, a) < dist(p, b) ? a : b));
}

const scaled = [];
for (let y = 0; y < th; y++) {
  const sy = miny + Math.floor((y * ch) / th);
  const row = Buffer.alloc(tw * 4);
  for (let x = 0; x < tw; x++) {
    const sx = minx + Math.floor((x * cw) / tw);
    const p = pixel(rows, sy, sx);
    const best = nearestPalette(p);
    row[x * 4] = best[0];
    row[x * 4 + 1] = best[1];
    row[x * 4 + 2] = best[2];
    row[x * 4 + 3] = best[3];
  }
  scaled.push(row);
}

const outW = tw;
const out = scaled;

// Knock out isolated near-black (background), keep outline blacks near color
for (let y = 0; y < outH; y++) {
  for (let x = 0; x < outW; x++) {
    const p = pixel(out, y, x);
    if (!(p[3] > 0 && p[0] < 28 && p[1] < 28 && p[2] < 34)) continue;
    let keep = false;
    for (let dy = -2; dy <= 2 && !keep; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const ny = y + dy;
        const nx = x + dx;
        if (ny < 0 || ny >= outH || nx < 0 || nx >= outW) continue;
        if (isColorful(pixel(out, ny, nx))) {
          keep = true;
          break;
        }
      }
    }
    if (!keep) {
      out[y][x * 4] = 0;
      out[y][x * 4 + 1] = 0;
      out[y][x * 4 + 2] = 0;
      out[y][x * 4 + 3] = 0;
    }
  }
}

mkdirSync(dirname(outPath), { recursive: true });
writePng(outPath, outW, outH, out);
console.log(`eidrolon ${outW}x${outH} (content scaled ${tw}x${th}) from draft`);
