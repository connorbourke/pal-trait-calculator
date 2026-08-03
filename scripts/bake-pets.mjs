#!/usr/bin/env node
/** Bake theme pet pixel sprites into public/pets/*.png */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "pets");

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
  for (let i = 0; i < buf.length; i++) {
    c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
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

function encodePng(width, height, rgbaRows) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    const row = rgbaRows[y];
    for (let x = 0; x < width; x++) {
      const i = rowStart + 1 + x * 4;
      const p = row[x];
      raw[i] = p[0];
      raw[i + 1] = p[1];
      raw[i + 2] = p[2];
      raw[i + 3] = p[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function hex(h) {
  const s = h.replace("#", "");
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
    255,
  ];
}

function canvas(w, h) {
  return Array.from({ length: h }, () =>
    Array.from({ length: w }, () => [0, 0, 0, 0]),
  );
}

function set(px, x, y, color) {
  if (y < 0 || y >= px.length || x < 0 || x >= px[0].length) return;
  px[y][x] = color;
}

function fill(px, x0, y0, x1, y1, color) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) set(px, x, y, color);
  }
}

function outlineRect(px, x0, y0, x1, y1, color) {
  for (let x = x0; x <= x1; x++) {
    set(px, x, y0, color);
    set(px, x, y1, color);
  }
  for (let y = y0; y <= y1; y++) {
    set(px, x0, y, color);
    set(px, x1, y, color);
  }
}

function writePng(path, px) {
  const h = px.length;
  const w = px[0].length;
  writeFileSync(path, encodePng(w, h, px));
  return { w, h };
}

function fillPoly(px, points, color) {
  if (points.length < 3) return;
  const ys = points.map((p) => p[1]);
  const minY = Math.max(0, Math.floor(Math.min(...ys)));
  const maxY = Math.min(px.length - 1, Math.ceil(Math.max(...ys)));
  for (let y = minY; y <= maxY; y++) {
    const nodes = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if ((yi < y && yj >= y) || (yj < y && yi >= y)) {
        nodes.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
      }
    }
    nodes.sort((a, b) => a - b);
    for (let i = 0; i + 1 < nodes.length; i += 2) {
      const x0 = Math.max(0, Math.ceil(nodes[i]));
      const x1 = Math.min(px[0].length - 1, Math.floor(nodes[i + 1]));
      for (let x = x0; x <= x1; x++) set(px, x, y, color);
    }
  }
}

function strokePoly(px, points, color, closed = true) {
  const n = points.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % n];
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      set(px, Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), color);
    }
  }
}

/**
 * Eidrolon — Charizard-like 3/4 stance, hovering.
 * Pixel density inspired by BW sprites; silhouette from BDSP/classic Charizard pose;
 * palette/features from in-game Eidrolon (black/white, cyan lightning wings).
 */
function bakeEidrolon() {
  const W = 80;
  const H = 64;
  const px = canvas(W, H);

  const K = hex("#0a0a0e");
  const B = hex("#16161f");
  const D = hex("#2e2e3a");
  const Wh = hex("#f2f5fa");
  const G = hex("#c5ceda");
  const C = hex("#3ce8ff");
  const T = hex("#1aa0bc");
  const E = hex("#9ef0ff");
  const N = hex("#0c0c14");

  // --- Far wing (behind, left of body, raised) ---
  const farBone = [
    [28, 22],
    [22, 16],
    [16, 12],
    [10, 11],
    [5, 14],
    [3, 20],
    [4, 26],
    [7, 30],
  ];
  strokePoly(px, farBone, K, false);
  strokePoly(
    px,
    farBone.map(([x, y]) => [x, y + 1]),
    G,
    false,
  );
  // far membrane (dimmer cyan)
  fillPoly(
    px,
    [
      [28, 23],
      [20, 18],
      [12, 15],
      [6, 18],
      [5, 24],
      [8, 28],
      [14, 26],
      [22, 24],
    ],
    T,
  );
  // jagged holes / lightning on far wing
  for (let i = 0; i < 18; i++) {
    const x = 8 + (i % 6) * 2;
    const y = 17 + Math.floor(i / 6) * 3 + (i % 2);
    if ((x + y) % 3 !== 0) set(px, x, y, C);
    if ((x * y) % 5 === 0) set(px, x, y, N);
  }

  // --- Near wing (camera-side, larger, Charizard-style raised) ---
  const nearBone = [
    [42, 20],
    [50, 14],
    [58, 10],
    [66, 9],
    [72, 12],
    [75, 18],
    [74, 26],
    [70, 34],
    [64, 40],
    [56, 42],
  ];
  strokePoly(px, nearBone, K, false);
  for (const [x, y] of nearBone) {
    set(px, x, y - 1, Wh);
    set(px, x, y, G);
    set(px, x, y + 1, K);
  }
  // thick bone feel
  strokePoly(
    px,
    nearBone.map(([x, y]) => [x - 1, y]),
    Wh,
    false,
  );

  // near membrane poly under bone
  fillPoly(
    px,
    [
      [42, 22],
      [52, 16],
      [62, 13],
      [70, 15],
      [73, 22],
      [70, 30],
      [64, 36],
      [56, 38],
      [48, 32],
      [44, 26],
    ],
    C,
  );
  // lightning / digital jagged overlay on near wing
  const bolts = [
    [48, 20, 52, 28],
    [54, 18, 58, 30],
    [60, 16, 64, 32],
    [66, 18, 69, 34],
    [50, 24, 56, 34],
    [58, 22, 62, 36],
  ];
  for (const [x0, y0, x1, y1] of bolts) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round(x0 + (x1 - x0) * t);
      const y = Math.round(y0 + (y1 - y0) * t);
      const key = (x + y * 3) & 7;
      if (key === 0) set(px, x, y, N);
      else if (key === 1) set(px, x, y, E);
      else if (key === 2) set(px, x + 1, y, Wh);
      else set(px, x, y, C);
      if (key === 3) set(px, x, y + 1, T);
    }
  }
  // dark membrane edge flecks
  for (let i = 0; i < 12; i++) {
    set(px, 55 + i, 30 + Math.floor(i / 2), N);
    set(px, 60 + (i % 5), 34 + (i % 4), K);
  }

  // --- Body (Charizard biped mass) ---
  // torso dark
  fillPoly(
    px,
    [
      [30, 24],
      [40, 22],
      [46, 26],
      [46, 38],
      [40, 44],
      [30, 44],
      [26, 38],
      [26, 28],
    ],
    B,
  );
  strokePoly(
    px,
    [
      [30, 24],
      [40, 22],
      [46, 26],
      [46, 38],
      [40, 44],
      [30, 44],
      [26, 38],
      [26, 28],
    ],
    K,
  );
  // white chest / belly (cream on Charizard)
  fillPoly(
    px,
    [
      [31, 26],
      [40, 25],
      [43, 28],
      [42, 40],
      [36, 43],
      [30, 40],
      [29, 30],
    ],
    Wh,
  );
  // black chest mark
  set(px, 36, 32, B);
  set(px, 37, 32, B);
  set(px, 37, 33, B);
  set(px, 38, 33, B);
  set(px, 38, 34, B);
  // shading on flank
  fill(px, 43, 30, 45, 38, D);

  // --- Neck + head facing left (Charizard profile) ---
  fillPoly(
    px,
    [
      [32, 24],
      [36, 22],
      [34, 16],
      [30, 14],
      [26, 16],
      [28, 22],
    ],
    Wh,
  );
  strokePoly(
    px,
    [
      [32, 24],
      [36, 22],
      [34, 16],
      [30, 14],
      [26, 16],
      [28, 22],
    ],
    K,
  );
  // head
  fillPoly(
    px,
    [
      [22, 12],
      [30, 10],
      [34, 12],
      [34, 18],
      [28, 20],
      [22, 18],
    ],
    Wh,
  );
  strokePoly(
    px,
    [
      [22, 12],
      [30, 10],
      [34, 12],
      [34, 18],
      [28, 20],
      [22, 18],
    ],
    K,
  );
  // snout / beak dark tip
  fill(px, 20, 14, 23, 17, B);
  set(px, 20, 15, K);
  set(px, 21, 16, K);
  // eye
  set(px, 28, 14, B);
  set(px, 29, 14, E);
  set(px, 29, 13, C);
  // horns swept back (Charizard horns + Eidrolon length)
  fillPoly(px, [[32, 10], [36, 6], [38, 8], [34, 12]], B);
  strokePoly(px, [[32, 10], [36, 6], [38, 8], [34, 12]], K);
  set(px, 36, 7, C);
  set(px, 35, 8, E);
  fillPoly(px, [[30, 9], [33, 4], [35, 5], [32, 11]], B);
  strokePoly(px, [[30, 9], [33, 4], [35, 5], [32, 11]], K);
  set(px, 33, 5, C);
  // neck spines
  set(px, 33, 15, Wh);
  set(px, 34, 16, Wh);
  set(px, 33, 17, K);

  // --- Arms (short, Charizard-like) ---
  fillPoly(px, [[40, 28], [46, 30], [48, 34], [44, 34], [40, 32]], Wh);
  strokePoly(px, [[40, 28], [46, 30], [48, 34], [44, 34], [40, 32]], K);
  set(px, 48, 34, C); // claw hint
  set(px, 47, 35, C);

  // --- Legs (biped, slightly lifted = hover) ---
  // rear leg
  fillPoly(px, [[30, 42], [34, 44], [34, 52], [30, 54], [28, 50], [28, 44]], B);
  strokePoly(px, [[30, 42], [34, 44], [34, 52], [30, 54], [28, 50], [28, 44]], K);
  set(px, 29, 54, C);
  set(px, 30, 55, C);
  set(px, 31, 54, T);
  // front leg
  fillPoly(px, [[36, 42], [42, 44], [42, 53], [38, 55], [34, 50], [34, 44]], D);
  strokePoly(px, [[36, 42], [42, 44], [42, 53], [38, 55], [34, 50], [34, 44]], K);
  fill(px, 36, 44, 40, 50, B);
  set(px, 38, 55, C);
  set(px, 39, 56, C);
  set(px, 40, 55, C);
  set(px, 41, 54, T);

  // --- Tail (Charizard curve, arrow tip instead of flame) ---
  const tail = [
    [44, 40],
    [50, 42],
    [56, 46],
    [60, 50],
    [62, 54],
    [58, 56],
    [52, 52],
    [46, 46],
  ];
  fillPoly(px, tail, Wh);
  strokePoly(px, tail, K);
  // underside dark
  fill(px, 50, 48, 56, 52, G);
  // arrow tip
  fillPoly(px, [[60, 52], [68, 50], [70, 54], [68, 58], [60, 56]], Wh);
  strokePoly(px, [[60, 52], [68, 50], [70, 54], [68, 58], [60, 56]], K);

  // hover shadow (soft ground hint, not standing)
  for (let x = 26; x <= 46; x++) {
    if ((x + 3) % 3 !== 0) set(px, x, 60, N);
  }

  return writePng(join(outDir, "eidrolon.png"), px);
}

mkdirSync(outDir, { recursive: true });
for (const script of ["quantize-eidrolon.mjs", "quantize-sekhmet.mjs"]) {
  const q = spawnSync(process.execPath, [join(__dirname, script)], {
    stdio: "inherit",
  });
  if (q.status) process.exit(q.status);
}
