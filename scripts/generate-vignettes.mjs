#!/usr/bin/env node
/*
 * generate-vignettes.mjs
 * ---------------------------------------------------------------------------
 * Draws the five provisional vignettes for the "puntos" of the coffee origin
 * experience as procedural pen-and-ink SVGs.
 *
 *   node scripts/generate-vignettes.mjs
 *
 * Writes (overwriting):
 *   public/assets/points/cultivo/cultivo-reference.svg
 *   public/assets/points/cosecha/cosecha-reference.svg
 *   public/assets/points/beneficio/beneficio-reference.svg
 *   public/assets/points/secado/secado-reference.svg
 *   public/assets/points/empaque/empaque-reference.svg
 *
 * ---------------------------------------------------------------------------
 * PRINCIPLE
 *
 * One ink colour (#2a4433) on one paper colour (#eef1e6). There is no flat
 * fill anywhere in the output: every value in the image is produced by the
 * density, weight and opacity of individual marks, the way an etching or a
 * pen drawing does it. A scene is therefore never "shapes with colours", it
 * is a set of regions handed to mark primitives together with a density
 * function that says how dark that region should be at any point.
 *
 * ---------------------------------------------------------------------------
 * MARK PRIMITIVES  (the whole vocabulary — every scene is built from these)
 *
 *   penStroke(pts)        A single line drawn by hand: resampled and pushed
 *                         sideways by smooth 1-D value noise so it breathes.
 *
 *   walkChunks(pts)       The workhorse. Walks a polyline by arc length and
 *                         emits short runs separated by gaps, each run
 *                         wobbled, its opacity and width jittered and scaled
 *                         by a density function sampled at the run's midpoint.
 *                         Everything below is a way of feeding it curves.
 *
 *   brokenContour(pts)    An outline drawn as several long runs with small
 *                         gaps — a contour the pen lifted off a few times.
 *                         Never a closed continuous shape.
 *
 *   hatch(poly)           Parallel hatching clipped to an arbitrary polygon by
 *                         scanline: the polygon is rotated into the hatch
 *                         frame, scanlines are intersected with its edges, and
 *                         the spans are handed to walkChunks. Line spacing is
 *                         jittered; runs overshoot the edge now and then.
 *
 *   crossHatch(poly)      Two or three hatch passes at different angles and
 *                         slightly different spacings — the darkest tone.
 *
 *   ribbon(A, B)          Form-following hatching: strokes interpolated
 *                         between two guide curves, so the hatching bends with
 *                         the object (a sack's belly, a basket's flank, rows
 *                         converging to a vanishing point).
 *
 *   ribbonCross(A, B)     The transverse family — strokes spanning A to B,
 *                         optionally bowed. Combined with ribbon() this gives
 *                         curvilinear cross-hatching, i.e. woven texture.
 *
 *   stipple(poly)         A density-modulated dot field. Dots are zero-length
 *                         round-capped subpaths, so they cost ~18 bytes each
 *                         and share the stroke buckets with everything else.
 *
 *   flicks(poly)          Short curved marks at a given direction field, with
 *                         spread — foliage, grass, chaff, fibre ends.
 *
 *   blobPoly(cx,cy,r)     Generator (not a mark): an irregular lobed closed
 *                         polygon, smoothed with Catmull-Rom. Coffee canopies,
 *                         heaps of cherries, cast shadows.
 *
 * Supporting generators: ellipsePoly, tube (tapered limb — fingers, stems),
 * leafPoly, band (the polygon between two curves).
 *
 * ---------------------------------------------------------------------------
 * OUTPUT
 *
 * Marks are bucketed by quantised (width, opacity) and each bucket is emitted
 * as ONE <path> holding thousands of subpaths. That is what keeps a drawing of
 * ~15 000 marks inside a few hundred kilobytes. Buckets are painted lightest
 * first so the dark accents sit on top.
 *
 * Paper grain is a single feTurbulence + feColorMatrix filter on one rect over
 * the whole image — not per element.
 *
 * The caption "Ilustración provisional" is drawn with the same pen, from a
 * small hand-built stroke alphabet further down, so the files carry no font
 * dependency and no text element.
 *
 * Everything is deterministic: one mulberry32 seed per scene. Re-running
 * reproduces the drawings byte for byte.
 * ---------------------------------------------------------------------------
 */

import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT_BASE = join(ROOT, 'public', 'assets', 'points');

const INK = '#2a4433';
const PAPER = '#eef1e6';
const W = 1200;
const H = 800;

/* frame: the plate rule, and the clip that lets marks graze past it */
const FR = { x0: 42, y0: 42, x1: 1158, y1: 730 };
const CLIP = { x: 28, y: 28, w: 1144, h: 716 };
const CAPTION_BASELINE = 770;

/* ===========================================================================
 * 0. randomness
 * ========================================================================= */

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  constructor(seed) {
    this._f = mulberry32(seed >>> 0);
  }
  f() {
    return this._f();
  }
  range(a, b) {
    return a + (b - a) * this._f();
  }
  int(a, b) {
    return Math.floor(a + (b - a + 1) * this._f());
  }
  gauss(m = 0, s = 1) {
    const u = 1 - this._f();
    const v = this._f();
    return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  chance(p) {
    return this._f() < p;
  }
  pick(arr) {
    return arr[Math.floor(this._f() * arr.length)];
  }
  sign() {
    return this._f() < 0.5 ? -1 : 1;
  }
}

/* smooth 1-D value noise, used for the sideways wobble of every stroke */
function makeNoise1(rng) {
  const N = 1024;
  const tab = new Float64Array(N);
  for (let i = 0; i < N; i++) tab[i] = rng.f() * 2 - 1;
  return (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = tab[((i % N) + N) % N];
    const b = tab[(((i + 1) % N) + N) % N];
    const t = f * f * (3 - 2 * f);
    return a + (b - a) * t;
  };
}

/* cheap smooth 2-D field from three 1-D slices — patchiness of tone */
function makeNoise2(rng) {
  const a = makeNoise1(rng);
  const b = makeNoise1(rng);
  const c = makeNoise1(rng);
  return (x, y) =>
    (a(x * 0.0121 + 3) + b(y * 0.0163 + 11) + c((x + y * 0.7) * 0.0074 + 29)) / 3;
}

/* ===========================================================================
 * 1. the ink sink — buckets of strokes, one <path> per bucket
 * ========================================================================= */

/* Global calibration. These two exist because a vignette is read at ~330 px
   wide in a phone modal, not at 1200: at that scale fine marks thin out and
   the whole plate goes grey. Everything below is authored at 1:1 and then
   gained up once, here. */
const GAIN_O = 1.34;
const GAIN_W = 1.12;

function num(v) {
  let r = Math.round(v * 10) / 10;
  if (Object.is(r, -0)) r = 0;
  let s = String(r);
  if (s.startsWith('0.')) s = s.slice(1);
  else if (s.startsWith('-0.')) s = '-' + s.slice(2);
  return s;
}

class Ink {
  constructor() {
    this.buckets = new Map();
    this.count = 0;
    /* optional aerial-perspective hook: (x, y) -> opacity multiplier */
    this.tone = null;
  }
  stroke(pts, w = 0.8, o = 0.45) {
    if (!pts || pts.length === 0) return;
    if (this.tone) {
      let sy = 0;
      let sx = 0;
      for (const p of pts) {
        sx += p[0];
        sy += p[1];
      }
      o *= this.tone(sx / pts.length, sy / pts.length);
    }
    const wq = Math.max(0.35, Math.round(w * GAIN_W * 10) / 10);
    const oq = Math.min(0.9, Math.max(0.12, Math.round(o * GAIN_O * 25) / 25));
    const key = wq + '|' + oq;
    let b = this.buckets.get(key);
    if (!b) {
      b = { w: wq, o: oq, d: [] };
      this.buckets.set(key, b);
    }
    let s = 'M' + num(pts[0][0]) + ' ' + num(pts[0][1]);
    if (pts.length === 1) {
      s += 'l.01 0';
    } else {
      for (let i = 1; i < pts.length; i++) {
        s += 'L' + num(pts[i][0]) + ' ' + num(pts[i][1]);
      }
    }
    b.d.push(s);
    this.count++;
  }
  /* a dot is a zero-length round-capped subpath: the cheapest mark there is.
     Its position is rounded to the pixel — stipple is random anyway, and at
     several tens of thousands of dots the two saved characters matter. */
  dot(x, y, r, o) {
    this.stroke([[Math.round(x), Math.round(y)]], clamp(r * 1.05, 0.3, 1.8), o);
  }
  paths() {
    const list = [...this.buckets.values()];
    /* lightest first so the darkest marks read on top */
    list.sort((a, b) => a.o - b.o || a.w - b.w);
    return list
      .map(
        (b) =>
          `<path stroke-width="${b.w}" stroke-opacity="${b.o}" d="${b.d.join('')}"/>`
      )
      .join('\n');
  }
}

/* ===========================================================================
 * 2. geometry helpers
 * ========================================================================= */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const lerp2 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

function polyLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

/* resample a polyline to points spaced `step` apart */
function resampleStep(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const seg = Math.hypot(x1 - x0, y1 - y0);
    if (seg < 1e-9) continue;
    let t = (step - carry) / seg;
    while (t <= 1) {
      out.push([lerp(x0, x1, t), lerp(y0, y1, t)]);
      t += step / seg;
    }
    carry = (carry + seg) % step;
  }
  const last = pts[pts.length - 1];
  const prev = out[out.length - 1];
  if (Math.hypot(last[0] - prev[0], last[1] - prev[1]) > step * 0.4) out.push(last);
  return out;
}

/* resample to exactly N evenly spaced points */
function resampleN(pts, n) {
  const L = polyLength(pts);
  if (L < 1e-6) return new Array(n).fill(pts[0]);
  const out = [];
  let seg = 1;
  let acc = 0;
  let segLen = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
  for (let i = 0; i < n; i++) {
    const target = (L * i) / (n - 1);
    while (acc + segLen < target && seg < pts.length - 1) {
      acc += segLen;
      seg++;
      segLen = Math.hypot(pts[seg][0] - pts[seg - 1][0], pts[seg][1] - pts[seg - 1][1]);
    }
    const t = segLen < 1e-9 ? 0 : clamp((target - acc) / segLen, 0, 1);
    out.push(lerp2(pts[seg - 1], pts[seg], t));
  }
  return out;
}

/* Catmull-Rom smoothing */
function smooth(pts, closed = false, per = 6) {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const at = (i) => (closed ? pts[((i % n) + n) % n] : pts[clamp(i, 0, n - 1)]);
  const out = [];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

function bbox(poly) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of poly) {
    if (p[0] < x0) x0 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[0] > x1) x1 = p[0];
    if (p[1] > y1) y1 = p[1];
  }
  return [x0, y0, x1, y1];
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function ellipsePoly(cx, cy, rx, ry, rot = 0, steps = 48, a0 = 0, a1 = TAU) {
  const out = [];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i <= steps; i++) {
    const a = lerp(a0, a1, i / steps);
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    out.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return out;
}

/* half of an ellipse, always returned left -> right.
   side 'front' is the near (lower) half, 'back' the far (upper) half */
function halfArc(cx, cy, rx, ry, side, steps = 60) {
  const s = side === 'front' ? 1 : -1;
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI - (i / steps) * Math.PI;
    out.push([cx + Math.cos(a) * rx, cy + s * Math.sin(a) * ry]);
  }
  return out;
}

/* the polygon between two curves (same direction) */
function band(a, b) {
  return a.concat(b.slice().reverse());
}

function rectPoly(x0, y0, x1, y1) {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

/* offset one side of a spine by a tapering radius */
function offsetSide(spine, sign, r0, r1) {
  const out = [];
  for (let i = 0; i < spine.length; i++) {
    const a = spine[Math.max(0, i - 1)];
    const b = spine[Math.min(spine.length - 1, i + 1)];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1;
    dx /= L;
    dy /= L;
    const r = lerp(r0, r1, i / (spine.length - 1));
    out.push([spine[i][0] - dy * sign * r, spine[i][1] + dx * sign * r]);
  }
  return out;
}

/* a tapered limb: finger, stem, rake tooth */
function tube(spineRaw, r0, r1, capSteps = 7) {
  const spine = resampleN(smooth(spineRaw, false, 6), 24);
  const L = offsetSide(spine, 1, r0, r1);
  const R = offsetSide(spine, -1, r0, r1);
  const tip = spine[spine.length - 1];
  const prev = spine[spine.length - 2];
  const ang = Math.atan2(tip[1] - prev[1], tip[0] - prev[0]);
  const cap = [];
  for (let i = 1; i < capSteps; i++) {
    const a = ang + Math.PI / 2 - (Math.PI * i) / capSteps;
    cap.push([tip[0] + Math.cos(a) * r1, tip[1] + Math.sin(a) * r1]);
  }
  return L.concat(cap, R.slice().reverse());
}

/* a coffee leaf: lens shape with a bend */
function leafPoly(base, tip, width, bend = 0.25) {
  const dx = tip[0] - base[0];
  const dy = tip[1] - base[1];
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  const nx = -uy;
  const ny = ux;
  const side = (s) => {
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const wdt = Math.sin(Math.pow(t, 0.78) * Math.PI) * width;
      const b = Math.sin(t * Math.PI) * bend * L;
      pts.push([
        base[0] + ux * L * t + nx * (wdt * s + b),
        base[1] + uy * L * t + ny * (wdt * s + b),
      ]);
    }
    return pts;
  };
  return side(1).concat(side(-1).reverse());
}

/* irregular lobed closed shape — canopies, heaps, cast shadows */
function blobPoly(rng, cx, cy, r, opts = {}) {
  const { lobes = 9, irr = 0.26, squash = 1, rot = 0, per = 5 } = opts;
  const raw = [];
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * TAU + rng.range(-0.16, 0.16) + rot;
    const rr = r * (1 + rng.range(-irr, irr));
    raw.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * squash]);
  }
  return smooth(raw, true, per);
}

/* ===========================================================================
 * 3. mark primitives
 * ========================================================================= */

const asDensity = (d) => (typeof d === 'function' ? d : () => d);

/* point + tangent at arc distance `dd` along an evenly resampled polyline */
function ptAt(P, step, dd) {
  const f = dd / step;
  const i = clamp(Math.floor(f), 0, P.length - 2);
  const t = clamp(f - i, 0, 1);
  const a = P[i];
  const b = P[i + 1];
  let tx = b[0] - a[0];
  let ty = b[1] - a[1];
  const L = Math.hypot(tx, ty) || 1;
  tx /= L;
  ty /= L;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, tx, ty];
}

/** a single hand-drawn line through the given points */
function penStroke(ctx, pts, opts = {}) {
  const { w = 0.8, o = 0.45, wobble = 0.7, step = 9 } = opts;
  if (pts.length < 2) return;
  const P = polyLength(pts) < step * 1.2 ? pts : resampleStep(pts, step);
  const ph = ctx.rng.f() * 600;
  const out = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)];
    const b = P[Math.min(P.length - 1, i + 1)];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1;
    dx /= L;
    dy /= L;
    const off = ctx.noise(ph + i * 0.5) * wobble;
    out.push([P[i][0] - dy * off, P[i][1] + dx * off]);
  }
  ctx.ink.stroke(out, w, o);
}

/**
 * THE WORKHORSE. Walk a polyline by arc length, emitting short runs with
 * gaps, each run wobbled and toned by the density function.
 */
function walkChunks(ctx, pts, opts = {}) {
  const {
    w = 0.7,
    o = 0.42,
    density = 1,
    chunk = [18, 70],
    gap = [1, 9],
    wobble = 0.65,
    oJit = 0.22,
    wJit = 0.2,
    lead = [0, 12],
    step = 8,
    minChunk = 2.5,
    gate = 1.12,
    segLen = 16,
    maxSeg = 6,
  } = opts;
  if (!pts || pts.length < 2) return;
  const total = polyLength(pts);
  if (total < minChunk) return;
  const P = resampleStep(pts, step);
  if (P.length < 2) return;
  const usable = (P.length - 1) * step;
  const dens = asDensity(density);
  const ph = ctx.rng.f() * 800;
  let s = ctx.rng.range(lead[0], lead[1]);
  while (s < usable) {
    const e = Math.min(s + ctx.rng.range(chunk[0], chunk[1]), usable);
    if (e - s > minChunk) {
      const m = ptAt(P, step, (s + e) / 2);
      const d = clamp(dens(m[0], m[1]), 0, 1);
      if (d > 0.015 && ctx.rng.f() < Math.min(1, d * gate)) {
        const n = Math.max(1, Math.min(maxSeg, Math.round((e - s) / segLen)));
        const out = [];
        for (let k = 0; k <= n; k++) {
          const dd = s + ((e - s) * k) / n;
          const p = ptAt(P, step, dd);
          const off = ctx.noise(ph + dd * 0.075) * wobble;
          out.push([p[0] - p[3] * off, p[1] + p[2] * off]);
        }
        ctx.ink.stroke(
          out,
          Math.max(0.25, w * (1 + ctx.rng.range(-wJit, wJit))),
          clamp(o * (0.48 + 0.52 * d) * (1 + ctx.rng.range(-oJit, oJit)), 0.1, 0.9)
        );
      }
    }
    s = e + ctx.rng.range(gap[0], gap[1]);
  }
}

/** an outline drawn as a few long runs with small gaps */
function brokenContour(ctx, pts, opts = {}) {
  walkChunks(ctx, pts, {
    w: 1.0,
    o: 0.6,
    chunk: [40, 190],
    gap: [1.5, 11],
    wobble: 0.8,
    lead: [0, 8],
    segLen: 13,
    maxSeg: 14,
    ...opts,
  });
}

/** parallel hatching clipped to a polygon by scanline */
function hatch(ctx, poly, opts = {}) {
  const {
    angle = 0.6,
    spacing = 6,
    jitter = 0.38,
    overshoot = [0, 4.5],
    minSpan = 1.5,
    ...rest
  } = opts;
  if (!poly || poly.length < 3) return;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const R = poly.map(([x, y]) => [x * ca + y * sa, -x * sa + y * ca]);
  const bb = bbox(R);
  const unrot = (X, Y) => [X * ca - Y * sa, X * sa + Y * ca];
  const xs = [];
  for (let Y = bb[1] + spacing * ctx.rng.range(0.1, 0.9); Y < bb[3]; Y += spacing * (1 + ctx.rng.range(-jitter, jitter))) {
    xs.length = 0;
    for (let i = 0; i < R.length; i++) {
      const p = R[i];
      const q = R[(i + 1) % R.length];
      if (p[1] <= Y !== q[1] <= Y) {
        const t = (Y - p[1]) / (q[1] - p[1]);
        xs.push(p[0] + t * (q[0] - p[0]));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = xs[i] - ctx.rng.range(overshoot[0], overshoot[1]);
      const x1 = xs[i + 1] + ctx.rng.range(overshoot[0], overshoot[1]);
      if (x1 - x0 < minSpan) continue;
      walkChunks(ctx, [unrot(x0, Y), unrot(x1, Y)], rest);
    }
  }
}

/** the darkest tone: several hatch passes at different angles */
function crossHatch(ctx, poly, opts = {}) {
  const { angles = [0.52, -0.78], spacing = 6, ...rest } = opts;
  angles.forEach((a, i) => hatch(ctx, poly, { ...rest, angle: a, spacing: spacing * (1 + i * 0.13) }));
}

/** form-following hatching: lines interpolated between two guide curves */
function ribbon(ctx, A, B, opts = {}) {
  const { lines = 20, samples = 56, uJit = 0.34, u0 = 0, u1 = 1, ...rest } = opts;
  const a = resampleN(A, samples);
  const b = resampleN(B, samples);
  for (let i = 0; i < lines; i++) {
    const u = clamp(lerp(u0, u1, (i + 0.5 + ctx.rng.range(-uJit, uJit)) / lines), 0, 1);
    const pts = [];
    for (let j = 0; j < samples; j++) pts.push(lerp2(a[j], b[j], u));
    walkChunks(ctx, pts, rest);
  }
}

/** the transverse family: strokes spanning A to B, optionally bowed */
function ribbonCross(ctx, A, B, opts = {}) {
  const { lines = 20, samples = 56, tJit = 0.34, bow = 0, t0 = 0, t1 = 1, ...rest } = opts;
  const a = resampleN(A, samples);
  const b = resampleN(B, samples);
  for (let i = 0; i < lines; i++) {
    const t = clamp(lerp(t0, t1, (i + 0.5 + ctx.rng.range(-tJit, tJit)) / lines), 0, 1);
    const j = clamp(Math.round(t * (samples - 1)), 0, samples - 1);
    const p = a[j];
    const q = b[j];
    if (bow === 0) {
      walkChunks(ctx, [p, q], rest);
    } else {
      const mx = (p[0] + q[0]) / 2;
      const my = (p[1] + q[1]) / 2;
      let dx = q[0] - p[0];
      let dy = q[1] - p[1];
      const L = Math.hypot(dx, dy) || 1;
      const k = bow * (0.75 + 0.5 * Math.sin(t * Math.PI));
      walkChunks(ctx, [p, [mx - (dy / L) * k, my + (dx / L) * k], q], rest);
    }
  }
}

/** density-modulated dot field */
function stipple(ctx, poly, opts = {}) {
  const { count = 400, r = [0.45, 1.25], o = [0.28, 0.66], density = 1, tries = 16 } = opts;
  if (!poly || poly.length < 3) return;
  const bb = bbox(poly);
  const dens = asDensity(density);
  let placed = 0;
  let attempts = 0;
  const max = count * tries + 200;
  while (placed < count && attempts++ < max) {
    const x = ctx.rng.range(bb[0], bb[2]);
    const y = ctx.rng.range(bb[1], bb[3]);
    if (!pointInPoly(x, y, poly)) continue;
    const d = clamp(dens(x, y), 0, 1);
    if (ctx.rng.f() > d) continue;
    ctx.ink.dot(
      x,
      y,
      ctx.rng.range(r[0], r[1]) * (0.72 + 0.46 * d),
      clamp(ctx.rng.range(o[0], o[1]) * (0.44 + 0.56 * d), 0.1, 0.9)
    );
    placed++;
  }
}

/** short curved marks along a direction field */
function flicks(ctx, poly, opts = {}) {
  const {
    count = 160,
    len = [7, 17],
    angle = () => -1.25,
    spread = 0.55,
    curve = 0.3,
    w = 0.65,
    o = 0.4,
    density = 1,
    tries = 14,
  } = opts;
  if (!poly || poly.length < 3) return;
  const bb = bbox(poly);
  const dens = asDensity(density);
  const ang = typeof angle === 'function' ? angle : () => angle;
  let placed = 0;
  let attempts = 0;
  const max = count * tries + 200;
  while (placed < count && attempts++ < max) {
    const x = ctx.rng.range(bb[0], bb[2]);
    const y = ctx.rng.range(bb[1], bb[3]);
    if (!pointInPoly(x, y, poly)) continue;
    const d = clamp(dens(x, y), 0, 1);
    if (ctx.rng.f() > d) continue;
    const a = ang(x, y) + ctx.rng.range(-spread, spread);
    const L = ctx.rng.range(len[0], len[1]);
    const ex = x + Math.cos(a) * L;
    const ey = y + Math.sin(a) * L;
    const c = ctx.rng.range(-curve, curve) * L;
    ctx.ink.stroke(
      [
        [x, y],
        [(x + ex) / 2 - Math.sin(a) * c, (y + ey) / 2 + Math.cos(a) * c],
        [ex, ey],
      ],
      w * (1 + ctx.rng.range(-0.25, 0.25)),
      clamp(o * (0.5 + 0.5 * d) * (1 + ctx.rng.range(-0.22, 0.22)), 0.1, 0.9)
    );
    placed++;
  }
}

/* ===========================================================================
 * 4. the stroke alphabet for the caption (no font dependency)
 *    coordinates in em, y up from the baseline
 * ========================================================================= */

const GLYPHS = {
  ' ': { a: 0.32, s: [] },
  I: {
    a: 0.34,
    s: [
      [[0.07, 0.7], [0.27, 0.7]],
      [[0.17, 0.7], [0.17, 0.0]],
      [[0.07, 0.0], [0.27, 0.0]],
    ],
  },
  l: { a: 0.26, s: [[[0.11, 0.72], [0.11, 0.06], [0.13, 0.01], [0.2, 0.0]]] },
  u: {
    a: 0.54,
    s: [
      [[0.09, 0.5], [0.09, 0.13], [0.14, 0.03], [0.25, 0.0], [0.35, 0.04], [0.41, 0.12]],
      [[0.42, 0.5], [0.42, 0.05], [0.49, 0.0]],
    ],
  },
  s: {
    a: 0.46,
    s: [
      [
        [0.38, 0.43], [0.31, 0.5], [0.17, 0.5], [0.08, 0.44], [0.09, 0.34],
        [0.18, 0.28], [0.33, 0.22], [0.39, 0.15], [0.37, 0.05], [0.26, 0.0],
        [0.13, 0.01], [0.06, 0.07],
      ],
    ],
  },
  t: {
    a: 0.34,
    s: [
      [[0.16, 0.66], [0.16, 0.09], [0.21, 0.01], [0.3, 0.03]],
      [[0.05, 0.49], [0.3, 0.49]],
    ],
  },
  r: {
    a: 0.38,
    s: [
      [[0.1, 0.5], [0.1, 0.0]],
      [[0.1, 0.33], [0.17, 0.45], [0.26, 0.5], [0.33, 0.49]],
    ],
  },
  a: {
    a: 0.5,
    s: [
      [
        [0.36, 0.42], [0.28, 0.5], [0.15, 0.5], [0.07, 0.43], [0.08, 0.14],
        [0.16, 0.01], [0.28, 0.0], [0.37, 0.08],
      ],
      [[0.37, 0.5], [0.37, 0.05], [0.44, 0.0]],
    ],
  },
  c: {
    a: 0.46,
    s: [
      [
        [0.38, 0.41], [0.3, 0.5], [0.16, 0.49], [0.07, 0.4], [0.07, 0.12],
        [0.16, 0.01], [0.29, 0.0], [0.38, 0.08],
      ],
    ],
  },
  i: {
    a: 0.26,
    s: [
      [[0.11, 0.5], [0.11, 0.05], [0.19, 0.0]],
      [[0.11, 0.66], [0.115, 0.665]],
    ],
  },
  o: {
    a: 0.52,
    s: [
      [
        [0.25, 0.5], [0.36, 0.46], [0.43, 0.36], [0.43, 0.15], [0.36, 0.04],
        [0.25, 0.0], [0.14, 0.04], [0.07, 0.15], [0.07, 0.36], [0.14, 0.46],
        [0.25, 0.5],
      ],
    ],
  },
  'ó': {
    a: 0.52,
    s: [
      [
        [0.25, 0.5], [0.36, 0.46], [0.43, 0.36], [0.43, 0.15], [0.36, 0.04],
        [0.25, 0.0], [0.14, 0.04], [0.07, 0.15], [0.07, 0.36], [0.14, 0.46],
        [0.25, 0.5],
      ],
      [[0.17, 0.62], [0.33, 0.75]],
    ],
  },
  n: {
    a: 0.54,
    s: [
      [[0.09, 0.5], [0.09, 0.0]],
      [[0.09, 0.35], [0.16, 0.46], [0.28, 0.5], [0.38, 0.45], [0.43, 0.34], [0.43, 0.0]],
    ],
  },
  p: {
    a: 0.54,
    s: [
      [[0.09, 0.5], [0.09, -0.2]],
      [
        [0.09, 0.41], [0.17, 0.49], [0.3, 0.5], [0.4, 0.42], [0.41, 0.13],
        [0.33, 0.02], [0.2, 0.0], [0.09, 0.08],
      ],
    ],
  },
  v: { a: 0.48, s: [[[0.06, 0.5], [0.24, 0.0], [0.42, 0.5]]] },
};

function textWidth(str, em, tracking) {
  let w = 0;
  for (const ch of str) {
    const g = GLYPHS[ch];
    if (!g) continue;
    w += g.a * em + tracking;
  }
  return w - tracking;
}

function drawText(ctx, str, x, baseline, opts = {}) {
  const { em = 22, tracking = 0.09, w = 1.15, o = 0.55 } = opts;
  const tr = tracking * em;
  let cx = x;
  for (const ch of str) {
    const g = GLYPHS[ch];
    if (!g) continue;
    for (const sub of g.s) {
      const pts = sub.map(([gx, gy]) => [cx + gx * em, baseline - gy * em]);
      if (pts.length === 2 && Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) < 1) {
        ctx.ink.dot(pts[0][0], pts[0][1], w * 0.85, o + 0.12);
      } else {
        penStroke(ctx, pts.length > 3 ? smooth(pts, false, 4) : pts, {
          w: w * ctx.rng.range(0.9, 1.12),
          o: o * ctx.rng.range(0.88, 1.12),
          wobble: 0.22,
          step: 4.5,
        });
      }
    }
    cx += g.a * em + tr;
  }
}

/* ===========================================================================
 * 5. the plate: frame rule and caption
 * ========================================================================= */

function drawFrame(ctx) {
  const { x0, y0, x1, y1 } = FR;
  const pad = 0;
  const sides = [
    [[x0 - pad, y0], [x1 + pad, y0]],
    [[x1, y0 - pad], [x1, y1 + pad]],
    [[x1 + pad, y1], [x0 - pad, y1]],
    [[x0, y1 + pad], [x0, y0 - pad]],
  ];
  for (const s of sides) {
    walkChunks(ctx, s, {
      w: 0.85,
      o: 0.4,
      chunk: [120, 420],
      gap: [0.5, 5],
      wobble: 0.5,
      segLen: 40,
      maxSeg: 30,
      lead: [0, 4],
    });
  }
}

function drawCaption(ctx) {
  const em = 22;
  const tw = textWidth('Ilustración provisional', em, 0.09 * em);
  drawText(ctx, 'Ilustración provisional', (W - tw) / 2, CAPTION_BASELINE, {
    em,
    tracking: 0.09,
    w: 1.15,
    o: 0.52,
  });
}

/* ===========================================================================
 * 6. document assembly
 * ========================================================================= */

const GRAIN = `<filter id="g" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
<feTurbulence type="fractalNoise" baseFrequency="0.42" numOctaves="3" seed="17" stitchTiles="stitch"/>
<feColorMatrix type="matrix" values="0 0 0 0 0.165 0 0 0 0 0.267 0 0 0 0 0.2 0.1 0.1 0.1 0 -0.125"/>
</filter>`;

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function assemble(scene, ink, plate) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(scene.aria)}">
<title>${esc(scene.title)}</title>
<desc>${esc(scene.desc)}</desc>
<defs>
${GRAIN}
<clipPath id="c"><rect x="${CLIP.x}" y="${CLIP.y}" width="${CLIP.w}" height="${CLIP.h}"/></clipPath>
</defs>
<rect width="${W}" height="${H}" fill="${PAPER}"/>
<g fill="none" stroke="${INK}" stroke-linecap="round" stroke-linejoin="round" clip-path="url(#c)">
${ink.paths()}
</g>
<g fill="none" stroke="${INK}" stroke-linecap="round" stroke-linejoin="round">
${plate.paths()}
</g>
<rect width="${W}" height="${H}" fill="${PAPER}" filter="url(#g)"/>
</svg>
`;
}

/* ===========================================================================
 * 7. SCENE — cultivo
 *    coffee on a steep slope, rows following the contour, a near branch left
 * ========================================================================= */

/* ===========================================================================
 * 7. SCENE — cultivo
 *    coffee on a steep slope, rows following the contour, a near branch left
 * ========================================================================= */

/* shortest distance from a point to a polyline — used for depth-of-field halos */
function distToPolyline(x, y, P) {
  let best = Infinity;
  for (let i = 1; i < P.length; i++) {
    const [ax, ay] = P[i - 1];
    const [bx, by] = P[i];
    const dx = bx - ax;
    const dy = by - ay;
    const L2 = dx * dx + dy * dy || 1;
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / L2, 0, 1);
    const d = Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
    if (d < best) best = d;
  }
  return best;
}

function drawCultivo(ctx) {
  const { rng, n2 } = ctx;

  /* aerial perspective: the distance is pale, the foreground carries weight */
  ctx.ink.tone = (x, y) => clamp(0.46 + 0.82 * ((y - 250) / 480), 0.42, 1.18);

  /* the sky is left as bare paper: restraint is the whole point */

  /* --- the cordillera behind -------------------------------------------- */
  const ridge = (yBase, amp, seedShift) => {
    const pts = [];
    for (let x = FR.x0 - 12; x <= FR.x1 + 12; x += 14) {
      const t = (x - FR.x0) / (FR.x1 - FR.x0);
      pts.push([
        x,
        yBase +
          Math.sin(t * 4.6 + seedShift) * amp +
          Math.sin(t * 10.9 + seedShift * 1.7) * amp * 0.38 +
          n2(x * 1.3 + seedShift * 120, yBase) * amp * 0.45,
      ]);
    }
    return smooth(pts, false, 3);
  };

  const r1 = ridge(178, 30, 0.3);
  const r2 = ridge(220, 22, 2.2);
  brokenContour(ctx, r1, { w: 0.75, o: 0.62, chunk: [50, 260], gap: [10, 46], wobble: 1.2 });
  brokenContour(ctx, r2, { w: 0.9, o: 0.78, chunk: [60, 300], gap: [6, 32], wobble: 1.05 });
  hatch(ctx, band(r1, r1.map(([x, y]) => [x, y + 46])), {
    angle: 1.18,
    spacing: 5.6,
    w: 0.5,
    o: 0.5,
    chunk: [7, 26],
    gap: [4, 20],
    density: (x, y) => clamp(0.6 - (y - 178) / 92 + n2(x, y) * 0.28, 0, 0.6),
  });
  hatch(ctx, band(r2, r2.map(([x, y]) => [x, y + 42])), {
    angle: 1.26,
    spacing: 4.8,
    w: 0.55,
    o: 0.6,
    chunk: [8, 28],
    gap: [3, 15],
    density: (x, y) => clamp(0.75 - (y - 220) / 88 + n2(x + 400, y) * 0.3, 0, 0.75),
  });

  /* --- the branch spine is fixed first: the slope is drawn around it ------ */
  const stemSpine = smooth(
    [
      [8, 396],
      [96, 428],
      [186, 486],
      [262, 562],
      [326, 648],
      [378, 744],
    ],
    false,
    8
  );
  const spineSamples = resampleStep(stemSpine, 10);
  /* 0 close to the branch, 1 well away — everything behind it softens */
  const halo = (x, y) => clamp((distToPolyline(x, y, spineSamples) - 74) / 90, 0, 1);

  /* --- the slope: contour rows ------------------------------------------- */
  const ROWS = 12;
  const contourY = (x, t) => {
    const base = 278 + 396 * Math.pow(t, 1.46);
    const k = 0.32 + 1.75 * t;
    const spur = 46 * k * Math.exp(-Math.pow((x - 850) / 250, 2));
    const gully = -32 * k * Math.exp(-Math.pow((x - 340) / 200, 2));
    const tilt = -(x - 600) * (0.05 + 0.1 * t);
    return base + spur + gully + tilt;
  };
  const rowCurve = (t) => {
    const pts = [];
    for (let x = FR.x0 - 46; x <= FR.x1 + 46; x += 16) pts.push([x, contourY(x, t)]);
    return pts;
  };
  const rows = [];
  for (let i = 0; i < ROWS; i++) rows.push(rowCurve(i / (ROWS - 1)));

  /* bare ground between the rows, hatched along the fall line */
  for (let i = 0; i < ROWS - 1; i++) {
    const t = i / (ROWS - 1);
    ribbon(ctx, rows[i], rows[i + 1], {
      lines: 2 + Math.round(t * 4),
      samples: 46,
      u0: 0.3,
      u1: 1,
      w: 0.5 + t * 0.2,
      o: 0.4,
      chunk: [12, 54],
      gap: [14, 66],
      wobble: 1.0,
      density: (x, y) =>
        clamp((0.12 + 0.3 * t + n2(x, y * 1.4) * 0.34) * (0.45 + 0.55 * halo(x, y)), 0, 0.7),
    });
    /* the shadow each row throws down the slope */
    ribbon(ctx, rows[i].map(([x, y]) => [x, y + 3]), rows[i + 1], {
      lines: 3,
      samples: 44,
      u0: 0,
      u1: 0.26,
      w: 0.55 + t * 0.4,
      o: 0.6,
      chunk: [10, 46],
      gap: [5, 26],
      density: (x, y) => clamp((0.34 + 0.5 * t + n2(x * 1.7, y) * 0.2) * (0.4 + 0.6 * halo(x, y)), 0, 0.92),
    });
  }

  /* two footpaths across the slope */
  for (const px of [512, 906]) {
    const tr = [];
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      const x = px + Math.sin(t * 3.4 + px) * 30 + t * 44;
      tr.push([x, contourY(x, t)]);
    }
    walkChunks(ctx, smooth(tr, false, 4), {
      w: 0.6,
      o: 0.4,
      chunk: [14, 56],
      gap: [22, 86],
      wobble: 1.4,
      density: (x, y) => 0.55 * halo(x, y) + 0.15,
    });
  }

  /* --- the rows themselves ------------------------------------------------
   * Close-planted coffee does not read as separate shrubs at this distance;
   * it reads as a scalloped hedge following the contour. So each row is one
   * long band whose upper edge is lobed at bush scale, toned dark at the
   * foot and left as paper at the crowns.
   * --------------------------------------------------------------------- */
  const hedgeRow = (t) => {
    const r = 7 + 40 * Math.pow(t, 1.4);
    const ph = t * 17.3 + 0.7;
    const lobe = (x) => r * (1.0 + 0.52 * Math.abs(Math.sin(x / (r * 1.42) + ph)));
    const step = Math.max(3.5, r * 0.16);
    const baseC = [];
    const crestC = [];
    for (let x = FR.x0 - 50; x <= FR.x1 + 50; x += step) {
      const gy = contourY(x, t);
      baseC.push([x, gy + r * 0.14]);
      crestC.push([x, gy - lobe(x) - n2(x * 2.4, t * 900) * r * 0.22]);
    }
    const crest = smooth(crestC, false, 2);
    const poly = band(crest, baseC);

    const dens = (px, py) => {
      const gy = contourY(px, t);
      const top = gy - lobe(px);
      const u = clamp((py - top) / Math.max(6, gy + r * 0.14 - top), 0, 1);
      const phase = Math.sin(px / (r * 1.42) + ph);
      return clamp((0.1 + Math.pow(u, 0.82) * 1.0 - phase * 0.28) * (0.3 + 0.7 * halo(px, py)), 0, 1);
    };

    stipple(ctx, poly, {
      count: Math.round(1250 * r * 0.021),
      r: [0.3, 0.6 + r * 0.011],
      o: [0.32, 0.76],
      density: dens,
    });
    hatch(ctx, poly, {
      angle: -1.02,
      spacing: 2.6 + t * 0.7,
      w: 0.58,
      o: 0.62,
      chunk: [4, 16],
      gap: [2, 10],
      wobble: 0.5,
      density: (px, py) => clamp((dens(px, py) - 0.14) * 1.3, 0, 0.92),
    });
    hatch(ctx, poly, {
      angle: 0.62,
      spacing: 3.2 + t * 0.8,
      w: 0.58,
      o: 0.6,
      chunk: [4, 14],
      gap: [3, 13],
      density: (px, py) => clamp((dens(px, py) - 0.5) * 1.8, 0, 0.9),
    });
    /* leaf flicks only where the light catches the crowns */
    flicks(ctx, poly, {
      count: Math.round(120 + 200 * t),
      len: [r * 0.1, r * 0.24],
      angle: () => -1.18,
      spread: 0.8,
      curve: 0.55,
      w: 0.5,
      o: 0.52,
      density: (px, py) => clamp((0.8 - dens(px, py)) * 1.5 * (0.3 + 0.7 * halo(px, py)), 0, 0.9),
    });
    /* the scalloped crown line, drawn only over the lobes */
    walkChunks(ctx, crest, {
      w: 0.7 + t * 0.4,
      o: 0.5,
      chunk: [6, 30],
      gap: [8, 46],
      wobble: 0.7,
      density: (px, py) => clamp(0.3 + Math.sin(px / (r * 1.42) + ph) * 0.45, 0, 0.8) * halo(px, py),
    });
    /* the dark foot of the hedge */
    walkChunks(ctx, baseC, {
      w: 0.9 + t * 0.7,
      o: 0.72,
      chunk: [14, 80],
      gap: [5, 32],
      wobble: 0.7,
      density: (px, py) => clamp(0.55 + 0.4 * t, 0, 0.95) * (0.25 + 0.75 * halo(px, py)),
    });
    /* a few stems showing through in the nearest rows */
    if (t > 0.6) {
      for (let x = FR.x0; x < FR.x1; x += r * rng.range(1.3, 2.4)) {
        const gy = contourY(x, t);
        if (halo(x, gy) < 0.5) continue;
        penStroke(ctx, [[x, gy - lobe(x) * 0.45], [x + rng.range(-3, 3), gy + r * 0.1]], {
          w: 0.8,
          o: 0.5,
          wobble: 0.5,
          step: 7,
        });
      }
    }
  };

  for (let i = 0; i < ROWS; i++) hedgeRow(i / (ROWS - 1));


  /* --- two shade trees ---------------------------------------------------- */
  const shadeTree = (x, t, scale) => {
    const gy = contourY(x, t);
    const h = 128 * scale;
    const r = 64 * scale;
    const cy = gy - h;
    penStroke(ctx, [[x, gy + 4], [x - 5 * scale, gy - h * 0.55], [x + 2 * scale, cy + r * 0.4]], {
      w: 1.9 * scale,
      o: 0.78,
      wobble: 0.6,
    });
    for (const [bx, by] of [
      [-r * 0.72, -r * 0.1],
      [r * 0.74, -r * 0.2],
      [-r * 0.3, -r * 0.62],
      [r * 0.36, -r * 0.6],
    ]) {
      penStroke(ctx, [[x, cy + r * 0.46], [x + bx * 0.6, cy + by * 0.4 + r * 0.2], [x + bx, cy + by]], {
        w: 1.15 * scale,
        o: 0.62,
        wobble: 0.5,
      });
    }
    const lobes = [
      [x, cy - r * 0.18, r * 0.84],
      [x - r * 0.74, cy + r * 0.22, r * 0.56],
      [x + r * 0.78, cy + r * 0.12, r * 0.6],
      [x - r * 0.32, cy - r * 0.62, r * 0.48],
      [x + r * 0.36, cy - r * 0.6, r * 0.5],
    ];
    for (const [lx, ly, lr] of lobes) {
      const poly = blobPoly(rng, lx, ly, lr, { lobes: 11, irr: 0.3, squash: 0.82 });
      const d = (px, py) => clamp(0.44 + ((py - ly) / lr) * 0.44 - ((px - lx) / lr) * 0.28, 0, 1);
      stipple(ctx, poly, {
        count: Math.round(lr * lr * 0.26),
        r: [0.32, 0.86],
        o: [0.28, 0.66],
        density: d,
      });
      hatch(ctx, poly, {
        angle: -0.92,
        spacing: 3.2,
        w: 0.55,
        o: 0.56,
        chunk: [4, 15],
        gap: [3, 11],
        density: (px, py) => clamp((d(px, py) - 0.34) * 1.5, 0, 0.88),
      });
      flicks(ctx, poly, {
        count: Math.round(lr * 1.4),
        len: [4, 11],
        angle: () => -1.1,
        spread: 1.0,
        curve: 0.45,
        w: 0.5,
        o: 0.5,
        density: (px, py) => clamp(0.95 - d(px, py) * 0.8, 0.1, 0.95),
      });
      walkChunks(ctx, poly, {
        w: 0.8,
        o: 0.58,
        chunk: [10, 40],
        gap: [6, 34],
        wobble: 0.8,
        density: (px, py) => clamp((d(px, py) - 0.44) * 2.2, 0, 0.9),
      });
    }
    const shp = ellipsePoly(x - r * 0.52, gy + r * 0.12, r * 0.95, r * 0.24, -0.08, 26);
    hatch(ctx, shp, {
      angle: 0.08,
      spacing: 2.9,
      w: 0.6,
      o: 0.62,
      chunk: [8, 30],
      gap: [2, 9],
      density: 0.85,
    });
  };
  shadeTree(646, 0.12, 0.5);
  shadeTree(1046, 0.36, 0.72);

  /* --- the near branch: the darkest thing in the picture ------------------ */
  const stemPoly = tube(stemSpine, 9, 3.6);
  hatch(ctx, stemPoly, {
    angle: 1.1,
    spacing: 2.5,
    w: 0.7,
    o: 0.62,
    chunk: [4, 13],
    gap: [1.5, 6],
    density: (x, y) => clamp(0.9 - Math.abs(Math.sin((x + y) * 0.055)) * 0.45, 0.22, 0.95),
  });
  brokenContour(ctx, stemPoly, { w: 1.9, o: 0.86, chunk: [34, 170], gap: [1.5, 8], wobble: 0.5 });

  const spine60 = resampleN(stemSpine, 60);
  const spineAt = (u) => spine60[clamp(Math.round(u * 59), 0, 59)];

  const nodes = [0.14, 0.33, 0.52, 0.71, 0.88];
  nodes.forEach((u, idx) => {
    const p = spineAt(u);
    const q = spineAt(Math.min(0.99, u + 0.04));
    const ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
    for (const side of [-1, 1]) {
      const la = ang + side * rng.range(0.78, 1.16);
      const L = rng.range(92, 134) * (1 - idx * 0.05);
      const tip = [p[0] + Math.cos(la) * L, p[1] + Math.sin(la) * L];
      const lp = leafPoly(p, tip, rng.range(18, 25), side * rng.range(0.02, 0.07));
      /* the shaded half of the leaf */
      const halfDens = (x, y) => {
        const rel = (x - p[0]) * -Math.sin(la) + (y - p[1]) * Math.cos(la);
        return clamp(0.06 + (side > 0 ? rel : -rel) / 19, 0, 0.92);
      };
      hatch(ctx, lp, {
        angle: la + 1.5,
        spacing: 3.0,
        w: 0.6,
        o: 0.58,
        chunk: [5, 20],
        gap: [2, 10],
        density: halfDens,
      });
      hatch(ctx, lp, {
        angle: la + 0.5,
        spacing: 4.6,
        w: 0.55,
        o: 0.5,
        chunk: [4, 16],
        gap: [4, 18],
        density: (x, y) => clamp(halfDens(x, y) - 0.45, 0, 0.9),
      });
      stipple(ctx, lp, {
        count: 150,
        r: [0.28, 0.66],
        o: [0.22, 0.5],
        density: (x, y) => clamp(halfDens(x, y) * 0.75, 0, 0.7),
      });
      brokenContour(ctx, lp, { w: 1.25, o: 0.8, chunk: [26, 110], gap: [2, 14], wobble: 0.75 });
      /* midrib and the pinnate veins coffee leaves are known for */
      penStroke(
        ctx,
        [p, [(p[0] + tip[0]) / 2 - Math.sin(la) * side * 6, (p[1] + tip[1]) / 2 + Math.cos(la) * side * 6], tip],
        { w: 0.95, o: 0.68, wobble: 0.45 }
      );
      for (let k = 1; k < 9; k++) {
        const vt = k / 9;
        const vb = [lerp(p[0], tip[0], vt), lerp(p[1], tip[1], vt)];
        for (const s2 of [-1, 1]) {
          const vw = Math.sin(Math.pow(vt, 0.78) * Math.PI) * rng.range(15, 22);
          penStroke(
            ctx,
            [
              vb,
              [
                vb[0] + Math.cos(la + s2 * 1.05) * vw + Math.cos(la) * vw * 0.42,
                vb[1] + Math.sin(la + s2 * 1.05) * vw + Math.sin(la) * vw * 0.42,
              ],
            ],
            { w: 0.55, o: 0.46, wobble: 0.4, step: 6 }
          );
        }
      }
    }
  });

  /* cherries, hung in clusters at the nodes */
  const cherry = (x, y, r) => {
    const poly = ellipsePoly(x, y, r, r * rng.range(0.93, 1.05), rng.range(-0.4, 0.4), 26);
    const d = (px, py) => {
      const dx = (px - (x - r * 0.32)) / r;
      const dy = (py - (y - r * 0.36)) / r;
      return clamp((Math.hypot(dx, dy) - 0.24) * 1.35, 0, 1);
    };
    stipple(ctx, poly, {
      count: Math.round(r * r * 2.4),
      r: [0.3, 0.8],
      o: [0.34, 0.8],
      density: d,
    });
    hatch(ctx, poly, {
      angle: -1.0,
      spacing: 2.1,
      w: 0.55,
      o: 0.62,
      chunk: [3, 11],
      gap: [1.5, 6],
      density: (px, py) => clamp((d(px, py) - 0.5) * 1.9, 0, 0.95),
    });
    brokenContour(ctx, poly, { w: 1.15, o: 0.8, chunk: [12, 48], gap: [2, 12], wobble: 0.4 });
  };

  nodes.forEach((u) => {
    const p = spineAt(u);
    const count = rng.int(6, 10);
    const cl = [];
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, TAU);
      const d = rng.range(0, 30);
      cl.push([p[0] + Math.cos(a) * d + rng.range(-7, 7), p[1] + Math.sin(a) * d * 0.8 + rng.range(8, 36)]);
    }
    cl.sort((a, b) => a[1] - b[1]);
    for (const [cx2, cy2] of cl) {
      penStroke(ctx, [p, [(p[0] + cx2) / 2, (p[1] + cy2) / 2 - 5], [cx2, cy2 - 10]], {
        w: 0.85,
        o: 0.62,
        wobble: 0.4,
        step: 6,
      });
    }
    for (const [cx2, cy2] of cl) cherry(cx2, cy2, rng.range(10.5, 16));
  });
}

/* ===========================================================================
 * 8. SCENE — cosecha
 *    hands and a woven basket heaped with cherries
 * ========================================================================= */

function bboxCenter(poly) {
  const b = bbox(poly);
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
}
function polyArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  }
  return Math.abs(a / 2);
}

function drawCosecha(ctx) {
  const { rng, n2 } = ctx;
  ctx.ink.tone = (x, y) => clamp(0.66 + 0.46 * ((y - 280) / 420), 0.62, 1.12);

  /* --- a suggestion of leaves behind, nothing legible -------------------- */
  const backdrop = rectPoly(FR.x0 - 6, FR.y0 - 6, FR.x1 + 6, 500);
  stipple(ctx, backdrop, {
    count: 1300,
    r: [0.28, 0.78],
    o: [0.2, 0.46],
    density: (x, y) => clamp(0.08 + n2(x * 0.8, y * 0.8) * 0.42 + 0.2 * ((y - FR.y0) / 440), 0, 0.42),
  });
  flicks(ctx, backdrop, {
    count: 460,
    len: [6, 16],
    angle: (x, y) => -1.2 + n2(x, y) * 1.0,
    spread: 0.7,
    curve: 0.4,
    w: 0.5,
    o: 0.3,
    density: (x, y) => clamp(0.08 + n2(x * 0.9 + 200, y) * 0.5, 0, 0.45),
  });
  for (let i = 0; i < 8; i++) {
    const bx = rng.range(FR.x0 + 40, FR.x1 - 40);
    const by = rng.range(FR.y0 + 30, 380);
    const a = rng.range(-2.4, -0.7);
    const L = rng.range(56, 104);
    const lp = leafPoly([bx, by], [bx + Math.cos(a) * L, by + Math.sin(a) * L], rng.range(10, 16), 0.12);
    brokenContour(ctx, lp, { w: 0.7, o: 0.4, chunk: [14, 52], gap: [14, 54], wobble: 0.9 });
    hatch(ctx, lp, { angle: a + 1.5, spacing: 4.4, w: 0.5, o: 0.34, chunk: [4, 15], gap: [5, 20], density: 0.5 });
  }

  /* --- the basket --------------------------------------------------------- */
  const RIM = { cx: 600, cy: 468, rx: 302, ry: 88 };
  const BASE = { cx: 594, cy: 698, rx: 196, ry: 48 };
  const rimFront = halfArc(RIM.cx, RIM.cy, RIM.rx, RIM.ry, 'front');
  const rimBack = halfArc(RIM.cx, RIM.cy, RIM.rx, RIM.ry, 'back');
  const baseFront = halfArc(BASE.cx, BASE.cy, BASE.rx, BASE.ry, 'front');
  const bodyPoly = band(rimFront, baseFront);

  /* a cylinder lit from the upper right, with a sliver of reflected light left */
  const bodyDens = (x, y) => {
    const u = clamp((x - (RIM.cx - RIM.rx)) / (RIM.rx * 2), 0, 1);
    const cyl = 0.2 + 0.78 * Math.pow(Math.abs(u - 0.66) / 0.66, 1.5);
    const low = clamp((y - 560) / 190, 0, 1) * 0.3;
    return clamp(cyl + low - (u < 0.05 ? 0.2 : 0), 0.08, 1);
  };

  /* the plait: bands following the form, ribs across, tone between */
  ribbon(ctx, rimFront, baseFront, {
    lines: 9,
    samples: 64,
    uJit: 0.2,
    w: 1.1,
    o: 0.68,
    chunk: [30, 190],
    gap: [4, 24],
    wobble: 1.1,
    density: (x, y) => clamp(bodyDens(x, y) * 0.6 + 0.4, 0.25, 1),
  });
  ribbonCross(ctx, rimFront, baseFront, {
    lines: 30,
    samples: 64,
    tJit: 0.3,
    bow: 5,
    w: 0.85,
    o: 0.58,
    chunk: [18, 110],
    gap: [6, 28],
    wobble: 1.0,
    density: (x, y) => clamp(bodyDens(x, y) * 0.7 + 0.3, 0.2, 1),
  });
  /* the plait itself: short marks that alternate direction band by band */
  ribbon(ctx, rimFront, baseFront, {
    lines: 40,
    samples: 64,
    w: 0.62,
    o: 0.56,
    chunk: [5, 18],
    gap: [7, 30],
    wobble: 0.6,
    density: (x, y) => clamp(bodyDens(x, y) - 0.06 + n2(x * 1.6, y * 1.6) * 0.22, 0, 1),
  });
  hatch(ctx, bodyPoly, {
    angle: -0.74,
    spacing: 3.4,
    w: 0.62,
    o: 0.6,
    chunk: [5, 24],
    gap: [3, 13],
    density: (x, y) => clamp((bodyDens(x, y) - 0.4) * 1.6, 0, 0.95),
  });
  hatch(ctx, bodyPoly, {
    angle: 0.68,
    spacing: 4.0,
    w: 0.6,
    o: 0.58,
    chunk: [5, 20],
    gap: [4, 17],
    density: (x, y) => clamp((bodyDens(x, y) - 0.6) * 2, 0, 0.92),
  });
  stipple(ctx, bodyPoly, {
    count: 1400,
    r: [0.28, 0.76],
    o: [0.22, 0.56],
    density: (x, y) => clamp(bodyDens(x, y) * 0.55, 0, 0.7),
  });

  brokenContour(ctx, baseFront, { w: 1.7, o: 0.86, chunk: [40, 190], gap: [2, 12], wobble: 0.6 });
  brokenContour(ctx, [rimFront[0], baseFront[0]], { w: 1.6, o: 0.84, chunk: [40, 180], gap: [2, 10] });
  brokenContour(ctx, [rimFront[rimFront.length - 1], baseFront[baseFront.length - 1]], {
    w: 1.6,
    o: 0.84,
    chunk: [40, 180],
    gap: [2, 10],
  });
  /* cast shadow on the ground */
  {
    const sh = blobPoly(rng, 520, 720, 258, { lobes: 11, irr: 0.13, squash: 0.18 });
    hatch(ctx, sh, {
      angle: 0.05,
      spacing: 2.9,
      w: 0.62,
      o: 0.6,
      chunk: [12, 60],
      gap: [3, 15],
      density: (x, y) => clamp(0.95 - Math.abs(x - 520) / 262 - Math.abs(y - 720) / 46, 0, 0.9),
    });
    hatch(ctx, sh, {
      angle: -0.92,
      spacing: 4.2,
      w: 0.55,
      o: 0.5,
      chunk: [8, 34],
      gap: [5, 22],
      density: (x, y) => clamp(0.7 - Math.abs(x - 520) / 230 - Math.abs(y - 720) / 42, 0, 0.7),
    });
  }

  /* the far rim, seen through the gap before the cherries cover it */
  brokenContour(ctx, rimBack, { w: 1.2, o: 0.66, chunk: [30, 150], gap: [4, 22], wobble: 0.6 });

  /* --- hands -------------------------------------------------------------
   * Built now, drawn last. Their outlines are needed up front so that the
   * fruit can be kept out from behind them: ink cannot erase, so a form in
   * front has to be reserved before the form behind is laid down. The hands
   * are then kept lighter in value than the cherries, and carry the heaviest
   * contour in the picture, which is what separates them from the mass.
   * --------------------------------------------------------------------- */
  const shadeLimb = (poly, lightDir, base = 0.22) => {
    const c = bboxCenter(poly);
    const d = (x, y) =>
      clamp(base + ((x - c[0]) * Math.cos(lightDir) + (y - c[1]) * Math.sin(lightDir)) / 52, 0, 0.8);
    hatch(ctx, poly, {
      angle: lightDir + 1.35,
      spacing: 3.4,
      w: 0.55,
      o: 0.46,
      chunk: [5, 22],
      gap: [3, 14],
      density: d,
    });
    hatch(ctx, poly, {
      angle: lightDir + 0.4,
      spacing: 5.2,
      w: 0.5,
      o: 0.4,
      chunk: [4, 16],
      gap: [5, 22],
      density: (x, y) => clamp(d(x, y) - 0.42, 0, 0.8),
    });
    stipple(ctx, poly, {
      count: Math.round(polyArea(poly) * 0.016),
      r: [0.24, 0.56],
      o: [0.16, 0.38],
      density: (x, y) => clamp(d(x, y) * 0.6 + 0.08, 0, 0.6),
    });
  };

  const buildHand = (spec) => {
    const { light, forearm, palm, fingers, thumb, tendons } = spec;
    const fa = tube(smooth(forearm.s, false, 6), forearm.r0, forearm.r1);
    const pa = tube(smooth(palm.s, false, 6), palm.r0, palm.r1);
    const fingerParts = fingers.map((f) => ({
      spine: smooth(f.s, false, 6),
      poly: tube(smooth(f.s, false, 6), f.r0, f.r1),
      r0: f.r0,
      r1: f.r1,
    }));
    const th = { spine: smooth(thumb.s, false, 6), poly: tube(smooth(thumb.s, false, 6), thumb.r0, thumb.r1), r0: thumb.r0, r1: thumb.r1 };
    const parts = [fa, pa, th.poly, ...fingerParts.map((f) => f.poly)];

    const drawDigit = (f) => {
      shadeLimb(f.poly, light, 0.2);
      brokenContour(ctx, f.poly, { w: 1.5, o: 0.88, chunk: [24, 120], gap: [2, 10], wobble: 0.5 });
      const S = resampleN(f.spine, 20);
      for (const k of [6, 12]) {
        const a = S[k];
        const b = S[k + 1];
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2;
        const rr = lerp(f.r0, f.r1, k / 19) * 0.8;
        penStroke(
          ctx,
          [
            [a[0] - Math.cos(ang) * rr, a[1] - Math.sin(ang) * rr],
            [a[0] + Math.cos(ang) * rr, a[1] + Math.sin(ang) * rr],
          ],
          { w: 0.7, o: 0.5, wobble: 0.5, step: 5 }
        );
      }
    };

    return {
      parts,
      draw() {
        shadeLimb(fa, light);
        brokenContour(ctx, fa, { w: 1.8, o: 0.9, chunk: [36, 180], gap: [2, 12] });
        shadeLimb(pa, light);
        brokenContour(ctx, pa, { w: 1.8, o: 0.9, chunk: [30, 140], gap: [2, 12] });
        if (spec.wrist) penStroke(ctx, spec.wrist, { w: 0.85, o: 0.52, wobble: 0.6, step: 6 });
        for (const f of fingerParts) drawDigit(f);
        drawDigit(th);
        if (tendons) {
          for (let i = 0; i < 4; i++) {
            const a = lerp2(tendons[0], tendons[1], i / 3);
            const b = lerp2(tendons[2], tendons[3], i / 3);
            penStroke(ctx, [a, lerp2(a, b, 0.5), b], { w: 0.65, o: 0.36, wobble: 0.8, step: 8 });
          }
        }
      },
    };
  };

  /* right hand: reaching down into the fruit, seen from the back */
  const handR = buildHand({
    light: -2.25,
    forearm: { s: [[1196, 98], [1136, 156], [1072, 212]], r0: 36, r1: 31 },
    palm: { s: [[1066, 204], [1002, 256], [936, 308]], r0: 38, r1: 36 },
    wrist: [[1096, 160], [1040, 226]],
    fingers: [
      { s: [[918, 284], [866, 325], [836, 372], [834, 404]], r0: 15, r1: 11 },
      { s: [[930, 300], [874, 344], [844, 394], [844, 430]], r0: 15.5, r1: 11.5 },
      { s: [[942, 316], [888, 360], [860, 408], [862, 442]], r0: 15, r1: 11 },
      { s: [[955, 332], [906, 372], [882, 414], [886, 444]], r0: 13.5, r1: 10 },
    ],
    thumb: { s: [[1004, 252], [966, 290], [950, 332]], r0: 18, r1: 13 },
    tendons: [[1040, 250], [992, 296], [930, 318], [962, 366]],
  });

  /* left hand: hooked over the rim */
  const handL = buildHand({
    light: -1.05,
    forearm: { s: [[-10, 288], [70, 324], [152, 360]], r0: 35, r1: 31 },
    palm: { s: [[150, 356], [204, 386], [258, 412]], r0: 36, r1: 34 },
    wrist: [[152, 326], [138, 392]],
    fingers: [
      { s: [[246, 437], [288, 456], [304, 486], [296, 512]], r0: 13, r1: 9.5 },
      { s: [[254, 420], [300, 440], [320, 472], [312, 502]], r0: 14.5, r1: 10.5 },
      { s: [[262, 404], [312, 424], [334, 458], [326, 490]], r0: 15, r1: 11 },
      { s: [[270, 387], [322, 406], [344, 436], [336, 468]], r0: 14.5, r1: 10.5 },
    ],
    thumb: { s: [[206, 392], [240, 418], [246, 452]], r0: 17, r1: 12 },
  });

  const handParts = [...handR.parts, ...handL.parts];
  /* true where a hand is in the way — nothing behind it gets drawn */
  const occluded = (x, y, pad = 0) => {
    for (const p of handParts) {
      if (pointInPoly(x, y, p)) return true;
      if (pad > 0) {
        if (
          pointInPoly(x + pad, y, p) ||
          pointInPoly(x - pad, y, p) ||
          pointInPoly(x, y + pad, p) ||
          pointInPoly(x, y - pad, p)
        ) {
          return true;
        }
      }
    }
    return false;
  };

  /* --- the heap ----------------------------------------------------------- */
  const heapTop = smooth(
    [
      [RIM.cx - RIM.rx + 4, RIM.cy - 2],
      [RIM.cx - RIM.rx * 0.74, RIM.cy - 74],
      [RIM.cx - RIM.rx * 0.3, RIM.cy - 134],
      [RIM.cx + RIM.rx * 0.06, RIM.cy - 148],
      [RIM.cx + RIM.rx * 0.48, RIM.cy - 118],
      [RIM.cx + RIM.rx * 0.82, RIM.cy - 56],
      [RIM.cx + RIM.rx - 4, RIM.cy - 2],
    ],
    false,
    8
  );
  const heapPoly = band(heapTop, rimFront);

  /* the darkness between the fruit goes down first */
  hatch(ctx, heapPoly, {
    angle: -0.8,
    spacing: 2.8,
    w: 0.6,
    o: 0.6,
    chunk: [5, 22],
    gap: [3, 13],
    density: (x, y) =>
      occluded(x, y)
        ? 0
        : clamp(0.3 + clamp((y - (RIM.cy - 110)) / 150, 0, 1) * 0.5 + clamp((RIM.cx - 40 - x) / 300, 0, 1) * 0.32, 0, 0.95),
  });
  crossHatch(ctx, heapPoly, {
    angles: [0.82, -0.18],
    spacing: 4.2,
    w: 0.55,
    o: 0.54,
    chunk: [4, 17],
    gap: [4, 19],
    density: (x, y) =>
      occluded(x, y)
        ? 0
        : clamp(clamp((y - (RIM.cy - 70)) / 140, 0, 1) * 0.72 + clamp((RIM.cx - 60 - x) / 260, 0, 1) * 0.36 - 0.2, 0, 0.92),
  });

  /* pack the cherries in, then draw them back to front */
  const cherries = [];
  for (let i = 0; i < 3400; i++) {
    const x = rng.range(RIM.cx - RIM.rx + 4, RIM.cx + RIM.rx - 4);
    const y = rng.range(RIM.cy - 152, RIM.cy + RIM.ry - 4);
    if (!pointInPoly(x, y, heapPoly)) continue;
    if (occluded(x, y, 16)) continue;
    const depth = clamp((y - (RIM.cy - 158)) / 210, 0, 1);
    const r = lerp(11.5, 22, depth) * rng.range(0.84, 1.14);
    let ok = true;
    for (const c of cherries) {
      if (Math.hypot(c[0] - x, c[1] - y) < (c[2] + r) * 0.76) {
        ok = false;
        break;
      }
    }
    if (ok) cherries.push([x, y, r]);
  }
  cherries.sort((a, b) => a[1] - b[1]);

  for (const [x, y, r] of cherries) {
    const poly = ellipsePoly(x, y, r, r * rng.range(0.9, 1.06), rng.range(-0.5, 0.5), 24);
    /* fruit low in the heap and to the left sits deeper in shadow */
    const mass = clamp(
      0.42 + clamp((y - (RIM.cy - 140)) / 200, 0, 1) * 0.5 + clamp((RIM.cx - x) / 400, 0, 1) * 0.24,
      0.35,
      1.05
    );
    const d = (px, py) => {
      const dx = (px - (x - r * 0.33)) / r;
      const dy = (py - (y - r * 0.4)) / r;
      return clamp((Math.hypot(dx, dy) - 0.22) * 1.3 * mass + (mass - 0.6) * 0.45, 0, 1);
    };
    stipple(ctx, poly, {
      count: Math.round(r * r * 1.22),
      r: [0.33, 0.92],
      o: [0.34, 0.85],
      density: d,
    });
    hatch(ctx, poly, {
      angle: -1.05,
      spacing: 2.4,
      w: 0.55,
      o: 0.64,
      chunk: [3, 12],
      gap: [1.5, 7],
      density: (px, py) => clamp((d(px, py) - 0.46) * 2, 0, 0.95),
    });
    brokenContour(ctx, poly, { w: 1.0, o: 0.74, chunk: [9, 38], gap: [2, 14], wobble: 0.4 });
    if (rng.chance(0.16)) {
      penStroke(ctx, [[x + r * 0.1, y - r * 0.95], [x + r * 0.22, y - r * 1.45]], {
        w: 0.75,
        o: 0.62,
        wobble: 0.3,
        step: 5,
      });
    }
  }

  /* two leaves that came in with the pick */
  for (const [bx, by, a, L] of [
    [RIM.cx - 246, RIM.cy - 34, -1.0, 108],
    [RIM.cx + 214, RIM.cy - 74, -0.4, 96],
  ]) {
    const lp = leafPoly([bx, by], [bx + Math.cos(a) * L, by + Math.sin(a) * L], 18, 0.14);
    hatch(ctx, lp, { angle: a + 1.5, spacing: 3.0, w: 0.6, o: 0.56, chunk: [5, 18], gap: [3, 12], density: 0.6 });
    brokenContour(ctx, lp, { w: 1.2, o: 0.78, chunk: [20, 80], gap: [2, 14] });
    penStroke(ctx, [[bx, by], [bx + Math.cos(a) * L, by + Math.sin(a) * L]], { w: 0.85, o: 0.64, wobble: 0.5 });
  }

  /* --- the rim, drawn last so it sits in front of the fruit --------------- */
  brokenContour(ctx, rimFront, { w: 1.9, o: 0.88, chunk: [50, 240], gap: [1.5, 8], wobble: 0.5 });
  brokenContour(ctx, rimFront.map(([x, y]) => [x, y + 13]), {
    w: 1.15,
    o: 0.7,
    chunk: [26, 130],
    gap: [3, 18],
    wobble: 0.6,
  });
  {
    const rf = resampleN(rimFront, 100);
    for (let i = 0; i < 100; i += 2) {
      const p = rf[i];
      penStroke(ctx, [[p[0] + rng.range(-3, 3), p[1] - 1], [p[0] + rng.range(-5, 5), p[1] + 14]], {
        w: 0.8,
        o: 0.5 + bodyDens(p[0], p[1]) * 0.25,
        wobble: 0.3,
        step: 6,
      });
    }
  }

  /* --- the hands, laid in last over the space reserved for them --------- */
  handL.draw();
  handR.draw();


  /* --- cherries that got away --------------------------------------------- */
  for (let i = 0; i < 7; i++) {
    const x = rng.range(170, 1090);
    const y = rng.range(700, 726);
    const r = rng.range(15, 21);
    const poly = ellipsePoly(x, y, r, r * 0.93, rng.range(-0.4, 0.4), 22);
    const d = (px, py) =>
      clamp((Math.hypot((px - (x - r * 0.32)) / r, (py - (y - r * 0.36)) / r) - 0.2) * 1.3, 0, 1);
    stipple(ctx, poly, { count: Math.round(r * r * 1.8), r: [0.3, 0.78], o: [0.32, 0.8], density: d });
    hatch(ctx, poly, {
      angle: -1.0,
      spacing: 2.3,
      w: 0.55,
      o: 0.6,
      chunk: [3, 12],
      gap: [1.5, 7],
      density: (px, py) => clamp((d(px, py) - 0.55) * 1.9, 0, 0.9),
    });
    brokenContour(ctx, poly, { w: 1.05, o: 0.76, chunk: [9, 36], gap: [2, 12], wobble: 0.4 });
    const sh = ellipsePoly(x - r * 0.5, y + r * 0.74, r * 1.25, r * 0.3, -0.06, 20);
    hatch(ctx, sh, { angle: 0.05, spacing: 2.4, w: 0.55, o: 0.54, chunk: [5, 22], gap: [2, 10], density: 0.8 });
  }
}

/* ===========================================================================
 * 9. SCENE — beneficio
 *    fermentation tanks, washing channel, despulpadora with its flywheel
 * ========================================================================= */

function drawBeneficio(ctx) {
  const { rng, n2 } = ctx;
  ctx.ink.tone = (x, y) => clamp(0.74 + 0.4 * ((y - 260) / 440), 0.7, 1.12);

  /* --- roof over the beneficiadero, kept faint ---------------------------- */
  {
    const eave = [[FR.x0 - 8, 118], [600, 86], [FR.x1 + 8, 122]];
    brokenContour(ctx, eave, { w: 1.1, o: 0.5, chunk: [50, 220], gap: [6, 34], wobble: 1.0 });
    brokenContour(ctx, eave.map(([x, y]) => [x, y + 18]), {
      w: 0.75,
      o: 0.36,
      chunk: [34, 160],
      gap: [12, 60],
      wobble: 1.0,
    });
    for (let i = 0; i <= 11; i++) {
      const t = i / 11;
      const x = lerp(FR.x0, FR.x1, t);
      const y = lerp(118, 122, t) - Math.sin(t * Math.PI) * 32 + 16;
      penStroke(ctx, [[x, y], [x + 9, y + 52]], { w: 0.85, o: 0.34, wobble: 0.5 });
    }
  }

  /* --- ground ------------------------------------------------------------- */
  const ground = rectPoly(FR.x0 - 6, 400, FR.x1 + 6, FR.y1 + 6);
  hatch(ctx, ground, {
    angle: 0.04,
    spacing: 7.5,
    w: 0.5,
    o: 0.38,
    chunk: [22, 100],
    gap: [18, 90],
    wobble: 1.2,
    density: (x, y) => clamp(0.12 + 0.3 * ((y - 400) / 330) + n2(x, y) * 0.26, 0, 0.5),
  });
  stipple(ctx, ground, {
    count: 1700,
    r: [0.26, 0.66],
    o: [0.18, 0.46],
    density: (x, y) => clamp(0.08 + 0.26 * ((y - 400) / 330) + n2(x * 1.4 + 90, y) * 0.3, 0, 0.48),
  });

  const DX = 84;
  const DY = -50;
  const boxFaces = (x0, y0, x1, y1) => ({
    front: rectPoly(x0, y0, x1, y1),
    top: [[x0, y0], [x0 + DX, y0 + DY], [x1 + DX, y0 + DY], [x1, y0]],
    side: [[x1, y0], [x1 + DX, y0 + DY], [x1 + DX, y1 + DY], [x1, y1]],
  });

  /* --- fermentation tanks -------------------------------------------------- */
  const tank = (x0, y0, x1, y1, fill) => {
    const f = boxFaces(x0, y0, x1, y1);
    const t = 15;
    const inner = [
      [x0 + t, y0 + t * 0.5],
      [x0 + DX - t * 0.3, y0 + DY + t * 0.5],
      [x1 + DX - t, y0 + DY + t * 0.5],
      [x1 - t * 0.5, y0 - t * 0.1],
    ];
    /* only the narrow concrete rim gets tone; the top of the wall stays pale
       so that the dark water inside reads as a cavity */
    hatch(ctx, band(f.top, inner.slice().reverse()), {
      angle: DY / DX + 0.02,
      spacing: 4.6,
      w: 0.5,
      o: 0.34,
      chunk: [10, 46],
      gap: [8, 40],
      density: 0.4,
    });
    /* the shadow the far wall throws on the water */
    walkChunks(ctx, [inner[1], inner[2]], {
      w: 3.4,
      o: 0.52,
      chunk: [30, 160],
      gap: [2, 12],
      wobble: 0.8,
    });
    walkChunks(ctx, [inner[0], inner[1]], {
      w: 3.0,
      o: 0.48,
      chunk: [20, 90],
      gap: [2, 12],
      wobble: 0.8,
    });
    /* water: the darkest note in the picture, with one band of sky sliding
       across it so that the surface reads as liquid and not as a lid */
    const gleam = (x, y) =>
      Math.exp(-Math.pow((x - (x0 + (x1 - x0) * 0.66) - (y - y0) * 1.1) / 40, 2));
    hatch(ctx, inner, {
      angle: DY / DX,
      spacing: 2.2,
      w: 0.75,
      o: 0.76,
      chunk: [18, 110],
      gap: [2, 14],
      wobble: 0.55,
      density: (x, y) => clamp(0.58 + 0.42 * fill + n2(x * 2, y * 2) * 0.2 - gleam(x, y) * 0.95, 0, 1),
    });
    hatch(ctx, inner, {
      angle: DY / DX + 0.9,
      spacing: 3.2,
      w: 0.62,
      o: 0.68,
      chunk: [6, 30],
      gap: [3, 15],
      density: (x, y) => clamp(0.44 + 0.46 * fill - gleam(x, y) * 1.0, 0, 0.95),
    });
    hatch(ctx, inner, {
      angle: DY / DX - 0.95,
      spacing: 4.4,
      w: 0.58,
      o: 0.6,
      chunk: [5, 24],
      gap: [4, 20],
      density: (x, y) => clamp(0.24 + 0.4 * fill - gleam(x, y) * 1.0, 0, 0.9),
    });
    stipple(ctx, inner, {
      count: 1400,
      r: [0.3, 0.86],
      o: [0.26, 0.72],
      density: (x, y) => clamp(0.4 + 0.42 * fill + n2(x * 3, y * 3) * 0.36 - gleam(x, y) * 0.8, 0, 0.92),
    });
    /* a scatter of cherries floating on top */
    for (let i = 0; i < 26; i++) {
      const p = [rng.range(x0 + 24, x1 + DX - 24), rng.range(y0 + DY + 12, y0 - 6)];
      if (!pointInPoly(p[0], p[1], inner)) continue;
      const r = rng.range(5, 8.5);
      brokenContour(ctx, ellipsePoly(p[0], p[1], r, r * 0.55, 0, 16), {
        w: 0.8,
        o: 0.56,
        chunk: [6, 24],
        gap: [3, 14],
        wobble: 0.3,
      });
    }
    brokenContour(ctx, inner, { w: 1.4, o: 0.8, chunk: [26, 130], gap: [2, 12] });

    /* wet concrete: lit from the right */
    hatch(ctx, f.front, {
      angle: 1.45,
      spacing: 4.2,
      w: 0.6,
      o: 0.5,
      chunk: [10, 48],
      gap: [5, 26],
      density: (x, y) =>
        clamp(0.6 - ((x - x0) / (x1 - x0)) * 0.44 + ((y - y0) / (y1 - y0)) * 0.34, 0, 0.88),
    });
    hatch(ctx, f.front, {
      angle: 0.06,
      spacing: 5.6,
      w: 0.5,
      o: 0.4,
      chunk: [16, 72],
      gap: [10, 50],
      density: (x, y) => clamp(0.32 - ((x - x0) / (x1 - x0)) * 0.22 + n2(x, y) * 0.3, 0, 0.6),
    });
    /* water stains running down the front */
    for (let i = 0; i < 7; i++) {
      const sx = rng.range(x0 + 14, x1 - 14);
      walkChunks(ctx, [[sx, y0 + 4], [sx + rng.range(-8, 8), y1 - rng.range(4, 50)]], {
        w: 0.6,
        o: 0.42,
        chunk: [10, 48],
        gap: [8, 40],
        wobble: 1.0,
      });
    }
    crossHatch(ctx, f.side, {
      angles: [1.36, 0.3],
      spacing: 3.4,
      w: 0.6,
      o: 0.58,
      chunk: [7, 30],
      gap: [3, 15],
      density: 0.72,
    });
    brokenContour(ctx, f.front, { w: 1.7, o: 0.86, chunk: [40, 190], gap: [2, 12] });
    brokenContour(ctx, f.top, { w: 1.3, o: 0.72, chunk: [30, 150], gap: [3, 16] });
    brokenContour(ctx, f.side, { w: 1.3, o: 0.72, chunk: [30, 150], gap: [3, 16] });
    const sh = [[x0 - 6, y1 + 2], [x1 + 6, y1 + 2], [x1 + 56, y1 + 40], [x0 + 40, y1 + 40]];
    crossHatch(ctx, sh, {
      angles: [0.18, -1.0],
      spacing: 3.2,
      w: 0.6,
      o: 0.6,
      chunk: [8, 36],
      gap: [3, 14],
      density: (x, y) => clamp(0.95 - (y - y1) / 48, 0, 0.92),
    });
  };

  tank(390, 352, 596, 486, 0.5);
  tank(74, 396, 368, 588, 0.9);

  /* --- the washing channel -------------------------------------------------
   * Drawn as an open trough seen from above and to the near side: the top of
   * the far bank, then its inner face falling into shadow, then the sheet of
   * water, then the top of the near bank and its outer face. Without those
   * four edges a channel just reads as a plank lying on the ground.
   * ---------------------------------------------------------------------- */
  {
    const bankTop = smooth(
      [[684, 442], [592, 474], [478, 512], [346, 562], [196, 616], [52, 660]],
      false,
      8
    );
    /* inner face of the far bank, then the sheet of water, then the near bank */
    const far = bankTop.map(([x, y], i) => [x + 15, y + 34 + Math.sin(i * 0.11) * 3]);
    const near = far.map(([x, y], i) => [x + 18, y + 76 + Math.sin(i * 0.09 + 2) * 4]);
    const lip = near.map(([x, y]) => [x + 13, y + 34]);
    const water = band(far, near);
    const innerFace = band(bankTop, far);
    hatch(ctx, innerFace, {
      angle: 1.3,
      spacing: 2.6,
      w: 0.62,
      o: 0.66,
      chunk: [6, 28],
      gap: [2, 10],
      density: 0.88,
    });
    hatch(ctx, innerFace, {
      angle: 0.5,
      spacing: 4.4,
      w: 0.55,
      o: 0.54,
      chunk: [5, 24],
      gap: [4, 20],
      density: 0.6,
    });
    brokenContour(ctx, bankTop, { w: 1.5, o: 0.82, chunk: [40, 200], gap: [2, 12] });
    /* the reflection of that wall, lying on the water just below it */
    ribbon(ctx, far, near, {
      lines: 4,
      samples: 72,
      u0: 0,
      u1: 0.2,
      w: 0.8,
      o: 0.7,
      chunk: [30, 190],
      gap: [4, 22],
      wobble: 1.4,
      density: 0.9,
    });
    /* Water is told by what is NOT drawn: the sheet stays largely paper, dark
       under the far bank where the wall is reflected, broken by transverse
       ripple ticks, and carrying the coffee as a stipple drift. */
    ribbon(ctx, far, near, {
      lines: 8,
      samples: 72,
      u0: 0.22,
      u1: 0.5,
      w: 0.68,
      o: 0.48,
      chunk: [18, 110],
      gap: [16, 90],
      wobble: 1.3,
      density: (x, y) => clamp(0.4 + n2(x * 1.6, y * 1.6) * 0.42, 0.06, 0.9),
    });
    ribbon(ctx, far, near, {
      lines: 8,
      samples: 72,
      u0: 0.55,
      u1: 1,
      w: 0.6,
      o: 0.4,
      chunk: [14, 70],
      gap: [26, 130],
      wobble: 1.3,
      density: (x, y) => clamp(0.18 + n2(x * 1.6 + 90, y * 1.6) * 0.42, 0, 0.66),
    });
    /* the parchment being washed down: drifts of grain carried by the flow.
       This is what stops the channel reading as a plank. */
    stipple(ctx, water, {
      count: 9000,
      r: [0.3, 1.05],
      o: [0.3, 0.82],
      density: (x, y) => clamp(0.34 + n2(x * 2.4, y * 3.4) * 0.8, 0, 0.98),
    });
    hatch(ctx, water, {
      angle: -0.36,
      spacing: 2.8,
      w: 0.58,
      o: 0.62,
      chunk: [4, 20],
      gap: [3, 18],
      density: (x, y) => clamp(0.16 + n2(x * 2.4 + 60, y * 3.4) * 0.8, 0, 0.92),
    });
    hatch(ctx, water, {
      angle: 0.9,
      spacing: 4.6,
      w: 0.55,
      o: 0.54,
      chunk: [3, 16],
      gap: [4, 22],
      density: (x, y) => clamp(-0.1 + n2(x * 2.4 + 60, y * 3.4) * 0.85, 0, 0.85),
    });
    /* ripple ticks across the flow, densest where the water is shallow */
    {
      const a = resampleN(far, 60);
      const b = resampleN(near, 60);
      for (let i = 0; i < 150; i++) {
        const j = rng.int(0, 59);
        const u = rng.range(0.12, 0.95);
        const p = lerp2(a[j], b[j], u);
        const w = rng.range(10, 26);
        penStroke(
          ctx,
          [
            [p[0] - w, p[1] + 3],
            [p[0] - w * 0.2, p[1] - 3],
            [p[0] + w * 0.85, p[1] + 2],
          ],
          { w: 0.7, o: rng.range(0.3, 0.66) * (1 - u * 0.4), wobble: 0.5, step: 7 }
        );
      }
    }
    /* the outer face of the near bank, catching the light */
    const wall = band(near, lip);
    hatch(ctx, wall, { angle: 1.3, spacing: 3.6, w: 0.58, o: 0.46, chunk: [7, 30], gap: [4, 18], density: 0.5 });
    hatch(ctx, wall, { angle: 0.45, spacing: 5.4, w: 0.52, o: 0.38, chunk: [6, 26], gap: [7, 32], density: 0.35 });
    brokenContour(ctx, far, { w: 1.3, o: 0.74, chunk: [40, 200], gap: [2, 12] });
    brokenContour(ctx, near, { w: 1.7, o: 0.88, chunk: [40, 200], gap: [2, 12] });
    brokenContour(ctx, lip, { w: 1.3, o: 0.72, chunk: [30, 160], gap: [4, 22] });
    /* the shadow the near bank drops on the ground */
    hatch(ctx, band(lip, lip.map(([x, y]) => [x + 16, y + 22])), {
      angle: 0.3,
      spacing: 3.0,
      w: 0.6,
      o: 0.58,
      chunk: [8, 40],
      gap: [3, 16],
      density: 0.75,
    });
    /* a sluice board dropped across the channel: nothing says "channel"
       like the thing you use to dam it */
    {
      const A = resampleN(far, 60);
      const B = resampleN(near, 60);
      const j = 22;
      const p = A[j];
      const q = B[j];
      const gate = [
        [p[0] - 7, p[1] - 30],
        [q[0] - 7, q[1] - 30],
        [q[0] + 7, q[1] + 4],
        [p[0] + 7, p[1] + 4],
      ];
      hatch(ctx, gate, {
        angle: Math.atan2(q[1] - p[1], q[0] - p[0]),
        spacing: 2.8,
        w: 0.6,
        o: 0.56,
        chunk: [6, 26],
        gap: [3, 14],
        density: 0.62,
      });
      brokenContour(ctx, gate, { w: 1.5, o: 0.84, chunk: [24, 120], gap: [2, 12] });
      /* water banking up against it */
      walkChunks(ctx, [[p[0] - 12, p[1] - 2], [q[0] - 12, q[1] + 2]], {
        w: 1.1,
        o: 0.62,
        chunk: [16, 80],
        gap: [3, 16],
        wobble: 1.4,
      });
    }
  }

  /* --- the despulpadora ---------------------------------------------------- */
  {
    /* timber frame */
    for (const [a, b, c, d] of [
      [700, 456, 722, 646],
      [876, 448, 898, 640],
      [786, 442, 804, 624],
    ]) {
      const p = [[a, b], [c, b], [c + 10, d], [a + 10, d]];
      hatch(ctx, p, { angle: 1.42, spacing: 2.9, w: 0.6, o: 0.5, chunk: [5, 22], gap: [3, 14], density: 0.62 });
      brokenContour(ctx, p, { w: 1.3, o: 0.76, chunk: [26, 140], gap: [2, 14] });
    }
    const brace = [[704, 556], [896, 540], [898, 556], [706, 572]];
    hatch(ctx, brace, { angle: 0.3, spacing: 3.2, w: 0.55, o: 0.48, chunk: [6, 26], gap: [4, 18], density: 0.58 });
    brokenContour(ctx, brace, { w: 1.2, o: 0.72, chunk: [24, 120], gap: [3, 16] });

    /* body */
    const f = boxFaces(694, 296, 896, 460);
    hatch(ctx, f.front, {
      angle: 1.5,
      spacing: 3.4,
      w: 0.6,
      o: 0.52,
      chunk: [9, 42],
      gap: [4, 20],
      density: (x, y) => clamp(0.62 - ((x - 694) / 202) * 0.4 + ((y - 296) / 164) * 0.36, 0, 0.9),
    });
    hatch(ctx, f.front, {
      angle: 0.05,
      spacing: 5.2,
      w: 0.5,
      o: 0.42,
      chunk: [14, 62],
      gap: [10, 46],
      density: (x, y) => clamp(0.32 - ((x - 694) / 202) * 0.22 + n2(x, y) * 0.3, 0, 0.6),
    });
    hatch(ctx, f.top, { angle: DY / DX, spacing: 4.0, w: 0.55, o: 0.42, chunk: [10, 46], gap: [6, 28], density: 0.42 });
    crossHatch(ctx, f.side, {
      angles: [1.34, 0.28],
      spacing: 3.6,
      w: 0.6,
      o: 0.58,
      chunk: [7, 30],
      gap: [4, 18],
      density: 0.74,
    });
    brokenContour(ctx, f.front, { w: 1.75, o: 0.88, chunk: [40, 190], gap: [2, 12] });
    brokenContour(ctx, f.top, { w: 1.3, o: 0.74, chunk: [30, 150], gap: [3, 16] });
    brokenContour(ctx, f.side, { w: 1.3, o: 0.74, chunk: [30, 150], gap: [3, 16] });
    for (let i = 0; i < 9; i++) {
      const x = lerp(708, 882, i / 8);
      ctx.ink.dot(x, 312, 1.4, 0.7);
      ctx.ink.dot(x, 446, 1.4, 0.64);
    }
    /* outlet chute, pulp falling out of it */
    const chute = [[726, 460], [830, 460], [816, 524], [744, 524]];
    crossHatch(ctx, chute, {
      angles: [1.4, 0.4],
      spacing: 3.2,
      w: 0.6,
      o: 0.6,
      chunk: [6, 26],
      gap: [3, 14],
      density: 0.78,
    });
    brokenContour(ctx, chute, { w: 1.3, o: 0.78, chunk: [24, 110], gap: [3, 16] });

    /* hopper */
    const hop = [[646, 162], [966, 162], [896, 296], [694, 296]];
    hatch(ctx, hop, {
      angle: 1.5,
      spacing: 4.0,
      w: 0.55,
      o: 0.46,
      chunk: [8, 36],
      gap: [5, 24],
      density: (x, y) => clamp(0.5 - ((x - 646) / 320) * 0.34 + ((y - 162) / 134) * 0.34, 0, 0.82),
    });
    brokenContour(ctx, hop, { w: 1.7, o: 0.86, chunk: [36, 170], gap: [2, 12] });
    brokenContour(ctx, [[650, 188], [962, 188]], { w: 1.0, o: 0.6, chunk: [26, 130], gap: [5, 26] });
    /* cherries brimming at the mouth */
    const heap = smooth(
      [[650, 186], [740, 158], [830, 150], [920, 162], [962, 186], [910, 214], [800, 224], [690, 212]],
      true,
      6
    );
    stipple(ctx, heap, {
      count: 2000,
      r: [0.3, 0.9],
      o: [0.28, 0.72],
      density: (x, y) => clamp(0.4 + n2(x * 3, y * 3) * 0.44 + (y - 150) / 150, 0, 0.92),
    });
    crossHatch(ctx, heap, {
      angles: [0.9, -0.9],
      spacing: 3.8,
      w: 0.55,
      o: 0.54,
      chunk: [4, 18],
      gap: [4, 18],
      density: (x, y) => clamp(0.3 + (y - 150) / 130, 0, 0.85),
    });
    for (let i = 0; i < 34; i++) {
      const cx2 = rng.range(660, 952);
      const cy2 = rng.range(158, 214);
      if (!pointInPoly(cx2, cy2, heap)) continue;
      const r = rng.range(6.5, 11);
      brokenContour(ctx, ellipsePoly(cx2, cy2, r, r * 0.96, 0, 18), {
        w: 0.85,
        o: 0.64,
        chunk: [7, 28],
        gap: [3, 16],
        wobble: 0.35,
      });
    }

    /* the flywheel */
    const WX = 1002;
    const WY = 390;
    const WR = 112;
    const outer = ellipsePoly(WX, WY, WR, WR, 0, 76);
    const innerR = ellipsePoly(WX, WY, WR - 17, WR - 17, 0, 76);
    const rimBand = band(outer, innerR.slice().reverse());
    hatch(ctx, rimBand, {
      angle: 0.7,
      spacing: 2.4,
      w: 0.62,
      o: 0.6,
      chunk: [5, 24],
      gap: [2, 10],
      density: (x, y) => clamp(0.4 + (WY - y) / (WR * 2.2) + (x - WX) / (WR * 3), 0.16, 0.95),
    });
    hatch(ctx, rimBand, {
      angle: -0.7,
      spacing: 3.6,
      w: 0.55,
      o: 0.52,
      chunk: [4, 18],
      gap: [3, 14],
      density: (x, y) => clamp(0.3 + (y - WY) / (WR * 1.6), 0, 0.85),
    });
    brokenContour(ctx, outer, { w: 1.9, o: 0.88, chunk: [44, 210], gap: [2, 12], wobble: 0.5 });
    brokenContour(ctx, innerR, { w: 1.3, o: 0.74, chunk: [32, 160], gap: [3, 16], wobble: 0.5 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3;
      const spoke = tube(
        [
          [WX + Math.cos(a) * 20, WY + Math.sin(a) * 20],
          [WX + Math.cos(a) * (WR - 15), WY + Math.sin(a) * (WR - 15)],
        ],
        7,
        4.2
      );
      hatch(ctx, spoke, {
        angle: a + 1.57,
        spacing: 2.3,
        w: 0.55,
        o: 0.52,
        chunk: [4, 16],
        gap: [2, 9],
        density: 0.68,
      });
      brokenContour(ctx, spoke, { w: 1.25, o: 0.76, chunk: [20, 96], gap: [2, 12] });
    }
    const hub = ellipsePoly(WX, WY, 22, 22, 0, 28);
    crossHatch(ctx, hub, {
      angles: [0.8, -0.8],
      spacing: 2.3,
      w: 0.6,
      o: 0.64,
      chunk: [4, 16],
      gap: [2, 8],
      density: 0.88,
    });
    brokenContour(ctx, hub, { w: 1.4, o: 0.82, chunk: [16, 70], gap: [2, 10] });
    const crank = tube(smooth([[WX + 6, WY - 8], [WX + 58, WY - 54], [WX + 84, WY - 52]], false, 6), 7, 9);
    hatch(ctx, crank, { angle: 0.4, spacing: 2.3, w: 0.55, o: 0.54, chunk: [4, 16], gap: [2, 10], density: 0.72 });
    brokenContour(ctx, crank, { w: 1.35, o: 0.8, chunk: [20, 96], gap: [2, 12] });
    /* the drive belt */
    penStroke(ctx, [[WX - WR + 4, WY - 38], [904, 372]], { w: 1.0, o: 0.64, wobble: 0.5 });
    penStroke(ctx, [[WX - WR + 4, WY + 38], [904, 404]], { w: 1.0, o: 0.64, wobble: 0.5 });

    /* shadow under the machine */
    const msh = [[698, 640], [912, 644], [986, 690], [768, 690]];
    crossHatch(ctx, msh, {
      angles: [0.16, -1.02],
      spacing: 3.0,
      w: 0.6,
      o: 0.62,
      chunk: [8, 36],
      gap: [3, 14],
      density: (x, y) => clamp(0.95 - (y - 640) / 58, 0, 0.92),
    });
  }

  /* --- pulp thrown clear ---------------------------------------------------- */
  for (let i = 0; i < 46; i++) {
    const x = rng.range(700, 1146);
    const y = rng.range(640, 726);
    const r = rng.range(4, 8);
    stipple(ctx, ellipsePoly(x, y, r, r * 0.78, rng.range(0, 3), 14), {
      count: Math.round(r * r * 1.8),
      r: [0.28, 0.7],
      o: [0.26, 0.62],
      density: 0.85,
    });
  }
}

/* ===========================================================================
 * 10. SCENE — secado
 *     beans raked into rows on a drying deck, seen at an angle, high sun
 * ========================================================================= */

function drawSecado(ctx) {
  const { rng, n2 } = ctx;
  ctx.ink.tone = (x, y) => clamp(0.44 + 0.92 * ((y - 280) / 450), 0.4, 1.18);

  /* --- the sun, high and small -------------------------------------------- */
  {
    const SX = 232;
    const SY = 118;
    /* no rays: a bare disc, and the light is told by the short shadows below */
    brokenContour(ctx, ellipsePoly(SX, SY, 40, 40, 0, 52), {
      w: 0.8,
      o: 0.42,
      chunk: [14, 60],
      gap: [16, 70],
      wobble: 0.9,
    });
    brokenContour(ctx, ellipsePoly(SX, SY, 62, 62, 0, 60), {
      w: 0.55,
      o: 0.2,
      chunk: [10, 44],
      gap: [26, 120],
      wobble: 1.2,
    });
  }

  /* --- the cordillera ------------------------------------------------------ */
  {
    const pts = [];
    for (let x = FR.x0 - 12; x <= FR.x1 + 12; x += 16) {
      const t = (x - FR.x0) / (FR.x1 - FR.x0);
      pts.push([x, 246 + Math.sin(t * 4.0 + 1.1) * 26 + Math.sin(t * 9.4) * 10 + n2(x * 1.4, 40) * 13]);
    }
    const ridge = smooth(pts, false, 3);
    brokenContour(ctx, ridge, { w: 0.9, o: 0.7, chunk: [44, 210], gap: [8, 42], wobble: 1.1 });
    hatch(ctx, band(ridge, ridge.map(([x, y]) => [x, y + 52])), {
      angle: 1.2,
      spacing: 4.8,
      w: 0.5,
      o: 0.6,
      chunk: [7, 26],
      gap: [4, 20],
      density: (x, y) => clamp(0.62 - (y - 246) / 100 + n2(x, y) * 0.3, 0, 0.62),
    });
  }

  /* --- the deck ------------------------------------------------------------ */
  const Q = { n0: [26, 742], n1: [1176, 682], f0: [392, 332], f1: [962, 324] };
  const deck = (u, v) => lerp2(lerp2(Q.n0, Q.n1, u), lerp2(Q.f0, Q.f1, u), v);
  /* rows crowd together with distance, but still reach the far edge exactly */
  const depth = (k) => (1 - 1 / (1 + 2.5 * k)) / (1 - 1 / 3.5);
  const VS = [];
  for (let i = 0; i <= 28; i++) VS.push(depth(i / 28));
  /* Rows raked by hand do not run true: each one wanders a little on its way
     to the vanishing point, and that wander is what keeps the deck from
     reading as corrugated sheet. */
  const uCurve = (u) =>
    VS.map((v) => {
      const wobble = (n2(u * 900, v * 260) * 0.5 + Math.sin(v * 5.2 + u * 31) * 0.28) * 0.02 * (1 - v * 0.72);
      return deck(clamp(u + wobble, -0.05, 1.05), v);
    });
  const deckPoly = [deck(0, 0), deck(1, 0), deck(1, 1), deck(0, 1)];

  /* the bare surface of the deck */
  hatch(ctx, deckPoly, {
    angle: -0.06,
    spacing: 8,
    w: 0.45,
    o: 0.36,
    chunk: [22, 110],
    gap: [20, 100],
    wobble: 1.3,
    density: (x, y) => clamp(0.1 + n2(x, y) * 0.3 + (y - 330) / 900, 0, 0.42),
  });

  /* the far parapet sits on the far edge */
  {
    const bot = [deck(0, 1), deck(0.25, 1), deck(0.5, 1), deck(0.75, 1), deck(1, 1)];
    const top = bot.map(([x, y]) => [x, y - 30]);
    const wall = band(top, bot);
    hatch(ctx, wall, {
      angle: 1.5,
      spacing: 3.4,
      w: 0.55,
      o: 0.52,
      chunk: [7, 28],
      gap: [4, 18],
      density: (x, y) => clamp(0.5 + n2(x * 2, y * 2) * 0.32, 0, 0.82),
    });
    hatch(ctx, wall, { angle: 0.02, spacing: 6, w: 0.5, o: 0.42, chunk: [14, 66], gap: [10, 44], density: 0.4 });
    brokenContour(ctx, top, { w: 1.3, o: 0.76, chunk: [34, 170], gap: [3, 18] });
    brokenContour(ctx, bot, { w: 1.5, o: 0.84, chunk: [60, 280], gap: [2, 12] });
    for (let i = 0; i <= 5; i++) {
      const p = deck(i / 5, 1);
      penStroke(ctx, [[p[0], p[1] - 32], [p[0] + 1, p[1] + 1]], { w: 1.0, o: 0.5, wobble: 0.3, step: 9 });
    }
  }

  /* --- the raked rows ------------------------------------------------------- */
  const ROWS = 12;
  const hw = 0.5 / ROWS;
  const nearness = (y) => clamp((y - 320) / 420, 0, 1);

  for (let i = 0; i < ROWS; i++) {
    const u = (i + 0.5) / ROWS;
    /* some rows were raked this morning and sit high, some are spread thin */
    const heap = 0.72 + 0.5 * Math.abs(Math.sin(i * 2.17 + 0.6));
    const crest = uCurve(u);
    const left = uCurve(u - hw * 0.94 * heap);
    const right = uCurve(u + hw * 0.94 * heap);

    /* the shaded flank carries the tone */
    ribbon(ctx, left, crest, {
      lines: 12,
      samples: 74,
      w: 0.6,
      o: 0.62,
      chunk: [10, 60],
      gap: [4, 22],
      wobble: 0.7,
      density: (x, y) => clamp(0.28 + 0.66 * nearness(y) + n2(x * 2, y * 2) * 0.22, 0, 0.95),
    });
    ribbonCross(ctx, left, crest, {
      lines: 70,
      samples: 74,
      w: 0.55,
      o: 0.54,
      chunk: [4, 22],
      gap: [3, 16],
      bow: 2.5,
      density: (x, y) => clamp(0.18 + 0.6 * nearness(y), 0, 0.88),
    });
    stipple(ctx, band(left, crest), {
      count: 1200,
      r: [0.28, 0.82],
      o: [0.26, 0.72],
      density: (x, y) => clamp(0.28 + 0.58 * nearness(y) + n2(x * 3, y * 3) * 0.3, 0, 0.95),
    });

    /* the lit flank is mostly paper */
    stipple(ctx, band(crest, right), {
      count: 560,
      r: [0.26, 0.68],
      o: [0.16, 0.46],
      density: (x, y) => clamp(0.1 + 0.32 * nearness(y) + n2(x * 3 + 70, y * 3) * 0.24, 0, 0.5),
    });
    ribbon(ctx, crest, right, {
      lines: 6,
      samples: 74,
      w: 0.5,
      o: 0.4,
      chunk: [8, 42],
      gap: [12, 56],
      density: (x, y) => clamp(0.1 + 0.34 * nearness(y), 0, 0.58),
    });

    brokenContour(ctx, crest, { w: 0.85, o: 0.52, chunk: [26, 130], gap: [8, 42], wobble: 0.9 });

    /* the trough between this row and the next */
    ribbon(ctx, uCurve(u + hw * 0.9), uCurve(u + hw * 1.14), {
      lines: 6,
      samples: 74,
      w: 0.62,
      o: 0.7,
      chunk: [10, 56],
      gap: [4, 22],
      density: (x, y) => clamp(0.3 + 0.64 * nearness(y), 0, 0.96),
    });
  }

  /* --- the near edge of the deck -------------------------------------------- */
  {
    const edge = [deck(0, 0), deck(0.5, 0), deck(1, 0)];
    brokenContour(ctx, edge, { w: 1.8, o: 0.86, chunk: [60, 280], gap: [2, 14], wobble: 0.7 });
    const face = band(edge, edge.map(([x, y]) => [x, y + 40]));
    crossHatch(ctx, face, {
      angles: [1.45, 0.5],
      spacing: 3.2,
      w: 0.6,
      o: 0.62,
      chunk: [7, 30],
      gap: [3, 14],
      density: 0.78,
    });
  }

  /* --- individual beans in the near band ------------------------------------ */
  {
    for (let i = 0; i < 260; i++) {
      const x = rng.range(FR.x0, FR.x1);
      const y = rng.range(600, 726);
      if (!pointInPoly(x, y, deckPoly)) continue;
      const rx = rng.range(7, 11);
      const ry = rx * rng.range(0.6, 0.76);
      const rot = rng.range(-0.8, 0.8);
      const p = ellipsePoly(x, y, rx, ry, rot, 18);
      brokenContour(ctx, p, { w: 0.75, o: 0.56, chunk: [6, 26], gap: [3, 15], wobble: 0.3 });
      penStroke(
        ctx,
        [
          [x - Math.cos(rot) * rx * 0.82, y - Math.sin(rot) * rx * 0.82],
          [x + Math.sin(rot) * 1.8, y - Math.cos(rot) * 1.8],
          [x + Math.cos(rot) * rx * 0.82, y + Math.sin(rot) * rx * 0.82],
        ],
        { w: 0.65, o: 0.6, wobble: 0.2, step: 4 }
      );
      stipple(ctx, p, { count: 20, r: [0.26, 0.6], o: [0.2, 0.52], density: 0.6 });
    }
  }

  /* --- the rake -------------------------------------------------------------- */
  {
    const a = [172, 730];
    const b = [498, 452];
    const handle = tube([a, [(a[0] + b[0]) / 2 + 10, (a[1] + b[1]) / 2], b], 10, 7);
    hatch(ctx, handle, {
      angle: Math.atan2(b[1] - a[1], b[0] - a[0]) + 1.57,
      spacing: 2.5,
      w: 0.6,
      o: 0.56,
      chunk: [5, 20],
      gap: [2, 10],
      density: (x, y) => clamp(0.35 + (x - 172) / 420, 0.2, 0.92),
    });
    brokenContour(ctx, handle, { w: 1.7, o: 0.88, chunk: [40, 200], gap: [2, 12], wobble: 0.5 });
    const dir = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const pnx = Math.cos(dir + Math.PI / 2);
    const pny = Math.sin(dir + Math.PI / 2);
    const h0 = [b[0] - pnx * 86, b[1] - pny * 86];
    const h1 = [b[0] + pnx * 86, b[1] + pny * 86];
    const headPoly = tube([h0, h1], 9, 9);
    crossHatch(ctx, headPoly, {
      angles: [dir, dir + 1.2],
      spacing: 2.9,
      w: 0.6,
      o: 0.58,
      chunk: [5, 22],
      gap: [3, 12],
      density: 0.72,
    });
    brokenContour(ctx, headPoly, { w: 1.5, o: 0.86, chunk: [32, 160], gap: [2, 12] });
    for (let i = 0; i <= 9; i++) {
      const p = lerp2(h0, h1, i / 9);
      const q = [p[0] + Math.cos(dir) * 30, p[1] + Math.sin(dir) * 30];
      brokenContour(ctx, tube([p, q], 4.5, 2.4), { w: 1.1, o: 0.74, chunk: [12, 52], gap: [2, 10], wobble: 0.35 });
    }
    /* a short shadow: the sun is nearly overhead */
    const sh = [
      [a[0] + 14, a[1] + 6],
      [b[0] + 18, b[1] + 10],
      [b[0] + 34, b[1] + 20],
      [a[0] + 32, a[1] + 16],
    ];
    hatch(ctx, sh, { angle: dir, spacing: 2.5, w: 0.6, o: 0.6, chunk: [10, 46], gap: [3, 14], density: 0.78 });
  }
}

/* ===========================================================================
 * 11. SCENE — empaque
 *     a finished sack with a deliberately blank label, a cup, scattered beans
 * ========================================================================= */

function drawEmpaque(ctx) {
  const { rng, n2 } = ctx;
  ctx.ink.tone = (x, y) => clamp(0.82 + 0.3 * ((y - 380) / 320), 0.8, 1.1);

  const TABLE = 614;

  /* --- table and the wall behind ------------------------------------------- */
  {
    hatch(ctx, rectPoly(FR.x0 - 6, FR.y0 - 6, FR.x1 + 6, TABLE), {
      angle: 1.52,
      spacing: 12,
      w: 0.45,
      o: 0.3,
      chunk: [34, 170],
      gap: [34, 170],
      wobble: 1.5,
      density: (x, y) => clamp(0.06 + n2(x * 0.7, y * 0.7) * 0.32, 0, 0.32),
    });
    brokenContour(ctx, [[FR.x0 - 6, TABLE], [FR.x1 + 6, TABLE - 4]], {
      w: 1.3,
      o: 0.66,
      chunk: [70, 340],
      gap: [5, 30],
      wobble: 0.8,
    });
    hatch(ctx, rectPoly(FR.x0 - 6, TABLE, FR.x1 + 6, FR.y1 + 6), {
      angle: 0.02,
      spacing: 6.5,
      w: 0.5,
      o: 0.34,
      chunk: [30, 150],
      gap: [14, 72],
      wobble: 1.0,
      density: (x, y) => clamp(0.14 + 0.26 * ((y - TABLE) / 90) + n2(x, y) * 0.24, 0, 0.5),
    });
  }

  /* --- the sack -------------------------------------------------------------- */
  /* deliberately not symmetric — a full sack settles to one side */
  const sackL = smooth(
    [[350, 246], [308, 316], [276, 414], [260, 516], [266, 596], [288, 664], [300, 680]],
    false,
    8
  );
  const sackR = smooth(
    [[590, 238], [626, 300], [648, 392], [656, 492], [650, 580], [632, 656], [620, 678]],
    false,
    8
  );
  const sackPoly = band(sackL, sackR);

  /* a hessian cylinder: dark flanks, a broad light down the middle-right */
  const shade = (x, y) => {
    const t = clamp((x - 268) / 398, 0, 1);
    const cyl = Math.pow(Math.abs(t - 0.58) / 0.58, 1.6);
    const floor = clamp((y - 520) / 170, 0, 1) * 0.36;
    const neck = clamp((300 - y) / 90, 0, 1) * 0.3;
    return clamp(
      0.16 + cyl * 0.76 + floor + neck - (t < 0.06 ? 0.16 : 0) + n2(x * 1.4, y * 1.4) * 0.09,
      0.05,
      1
    );
  };

  /* the blank label is a hole in every density function on the sack */
  const LAB = smooth([[356, 372], [572, 364], [580, 500], [350, 508]], true, 1);
  const LABPAD = smooth([[350, 366], [578, 358], [586, 506], [344, 514]], true, 1);
  /* the weave still shows faintly through the blank panel, so it reads as a
     label sewn on cloth rather than a hole cut in the drawing */
  const jute = (x, y) => (pointInPoly(x, y, LABPAD) ? shade(x, y) * 0.13 : shade(x, y));

  ribbon(ctx, sackL, sackR, {
    lines: 58,
    samples: 62,
    uJit: 0.26,
    w: 0.62,
    o: 0.52,
    chunk: [14, 84],
    gap: [4, 22],
    wobble: 0.6,
    density: jute,
  });
  ribbonCross(ctx, sackL, sackR, {
    lines: 60,
    samples: 62,
    tJit: 0.24,
    bow: 18,
    w: 0.62,
    o: 0.52,
    chunk: [12, 72],
    gap: [4, 24],
    wobble: 0.6,
    density: jute,
  });
  hatch(ctx, sackPoly, {
    angle: -0.78,
    spacing: 3.6,
    w: 0.6,
    o: 0.56,
    chunk: [6, 28],
    gap: [3, 16],
    density: (x, y) => clamp((jute(x, y) - 0.34) * 1.5, 0, 0.95),
  });
  hatch(ctx, sackPoly, {
    angle: 0.74,
    spacing: 4.4,
    w: 0.58,
    o: 0.54,
    chunk: [5, 24],
    gap: [4, 20],
    density: (x, y) => clamp((jute(x, y) - 0.56) * 1.9, 0, 0.9),
  });
  stipple(ctx, sackPoly, {
    count: 2400,
    r: [0.26, 0.7],
    o: [0.2, 0.52],
    density: (x, y) => clamp(jute(x, y) * 0.58, 0, 0.7),
  });
  flicks(ctx, sackPoly, {
    count: 460,
    len: [3, 9],
    angle: (x) => (x < 440 ? -0.6 : -2.5),
    spread: 1.1,
    curve: 0.4,
    w: 0.5,
    o: 0.4,
    density: (x, y) => (pointInPoly(x, y, LABPAD) ? 0 : clamp(0.24 + shade(x, y) * 0.4, 0, 0.8)),
  });

  /* creases hanging from the mouth */
  for (let i = 0; i < 11; i++) {
    const t = i / 10;
    const x0 = lerp(348, 588, t);
    walkChunks(
      ctx,
      smooth(
        [
          [x0, 282],
          [x0 + rng.range(-12, 12), 360],
          [x0 + rng.range(-22, 22), 452],
        ],
        false,
        6
      ),
      {
        w: 0.75,
        o: 0.4 + Math.abs(t - 0.5) * 0.5,
        chunk: [16, 70],
        gap: [14, 66],
        wobble: 0.9,
        density: (x, y) => (pointInPoly(x, y, LABPAD) ? 0 : 0.85),
      }
    );
  }

  /* --- the sewn mouth ---------------------------------------------------------
   * A filled sack is folded flat and stitched across the top, which leaves a
   * narrow flap of surplus cloth and a stiff little ear at each corner. That
   * is what tells the eye it is a sack and not a jar.
   * ------------------------------------------------------------------------ */
  {
    const seam = smooth([[350, 244], [420, 228], [478, 224], [538, 228], [590, 238]], false, 8);
    const flapTop = seam.map(([x, y]) => [x, y - 24]);
    const flap = band(flapTop, seam);
    hatch(ctx, flap, {
      angle: 1.5,
      spacing: 3.0,
      w: 0.6,
      o: 0.52,
      chunk: [6, 24],
      gap: [3, 15],
      density: (x, y) => clamp(0.36 + (Math.abs(x - 470) / 130) * 0.5, 0, 0.9),
    });
    hatch(ctx, flap, {
      angle: 0.06,
      spacing: 4.2,
      w: 0.55,
      o: 0.44,
      chunk: [8, 40],
      gap: [6, 30],
      density: 0.4,
    });
    brokenContour(ctx, flapTop, { w: 1.5, o: 0.82, chunk: [30, 150], gap: [3, 16], wobble: 0.9 });
    /* the stitch line */
    penStroke(ctx, seam, { w: 1.4, o: 0.78, wobble: 0.5 });
    {
      const S = resampleN(seam, 34);
      for (let i = 0; i < 33; i += 2) {
        penStroke(ctx, [[S[i][0], S[i][1] - 6], [S[i + 1][0] + 2, S[i + 1][1] + 5]], {
          w: 0.85,
          o: 0.62,
          wobble: 0.3,
          step: 5,
        });
      }
    }
    /* the two corner ears */
    for (const [ex, ey, s] of [
      [352, 244, -1],
      [590, 238, 1],
    ]) {
      const ear = smooth(
        [
          [ex, ey + 4],
          [ex + s * 12, ey - 26],
          [ex + s * 38, ey - 44],
          [ex + s * 30, ey - 14],
          [ex + s * 16, ey + 2],
        ],
        true,
        6
      );
      hatch(ctx, ear, {
        angle: 0.9 * s,
        spacing: 2.7,
        w: 0.58,
        o: 0.54,
        chunk: [4, 18],
        gap: [3, 13],
        density: 0.6,
      });
      brokenContour(ctx, ear, { w: 1.35, o: 0.8, chunk: [16, 76], gap: [2, 12], wobble: 0.7 });
    }
  }

  /* silhouette and the way the sack settles on the table */
  brokenContour(ctx, sackL, { w: 1.8, o: 0.88, chunk: [46, 220], gap: [2, 12], wobble: 0.6 });
  brokenContour(ctx, sackR, { w: 1.8, o: 0.88, chunk: [46, 220], gap: [2, 12], wobble: 0.6 });
  {
    const foot = smooth([[300, 668], [384, 688], [486, 694], [574, 688], [630, 668]], false, 6);
    brokenContour(ctx, foot, { w: 1.7, o: 0.86, chunk: [34, 170], gap: [2, 12] });
    const sh = smooth(
      [[298, 670], [400, 700], [520, 708], [634, 692], [716, 714], [520, 732], [330, 716]],
      true,
      6
    );
    crossHatch(ctx, sh, {
      angles: [0.14, -0.96],
      spacing: 3.0,
      w: 0.6,
      o: 0.6,
      chunk: [8, 38],
      gap: [3, 15],
      density: (x, y) => clamp(0.95 - (y - 668) / 76, 0, 0.92),
    });
  }

  /* the shoulder crease, where the cloth is pulled tight by the seam */
  {
    penStroke(ctx, smooth([[312, 302], [400, 326], [520, 326], [618, 300]], false, 6), {
      w: 1.1,
      o: 0.5,
      wobble: 0.9,
    });
  }

  /* --- the deliberately blank label ------------------------------------------- */
  {
    const inner = smooth([[366, 382], [562, 375], [569, 490], [361, 497]], true, 1);
    /* a breath of tone in the margin only — the panel itself stays paper */
    hatch(ctx, band(LAB, inner.slice().reverse()), {
      angle: -0.8,
      spacing: 3.2,
      w: 0.5,
      o: 0.4,
      chunk: [5, 20],
      gap: [4, 18],
      density: 0.5,
    });
    brokenContour(ctx, LAB, { w: 1.45, o: 0.78, chunk: [40, 190], gap: [2, 12], wobble: 0.5 });
    brokenContour(ctx, inner, { w: 0.75, o: 0.5, chunk: [26, 130], gap: [4, 22], wobble: 0.5 });
    const stitch = (a, b) => {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.round(L / 11);
      for (let i = 0; i < n; i++) {
        penStroke(ctx, [lerp2(a, b, (i + 0.15) / n), lerp2(a, b, (i + 0.72) / n)], {
          w: 0.9,
          o: 0.56,
          wobble: 0.35,
          step: 5,
        });
      }
    };
    const c = [
      [361, 377],
      [567, 370],
      [574, 495],
      [356, 502],
    ];
    stitch(c[0], c[1]);
    stitch(c[1], c[2]);
    stitch(c[2], c[3]);
    stitch(c[3], c[0]);
    /* the panel is left empty on purpose: nothing is printed here yet */
  }

  /* --- the cup ---------------------------------------------------------------- */
  {
    const CX = 928;
    const rimY = 470;
    const rim = ellipsePoly(CX, rimY, 100, 29, 0, 56);
    const rimIn = ellipsePoly(CX, rimY + 2, 89, 25, 0, 56);
    const bodyL = smooth([[CX - 100, rimY], [CX - 92, rimY + 46], [CX - 70, rimY + 90], [CX - 50, rimY + 108]], false, 6);
    const bodyR = smooth([[CX + 100, rimY], [CX + 92, rimY + 46], [CX + 70, rimY + 90], [CX + 50, rimY + 108]], false, 6);
    const bodyPoly = band(bodyL, bodyR);

    /* the coffee, with a crescent of reflected window left as paper */
    const gleam = (x, y) =>
      Math.exp(-Math.pow((x - (CX - 38)) / 38, 2) - Math.pow((y - (rimY + 4)) / 12, 2));
    stipple(ctx, rimIn, {
      count: 2100,
      r: [0.28, 0.82],
      o: [0.28, 0.82],
      density: (x, y) => {
        const d = Math.hypot((x - (CX + 20)) / 76, (y - (rimY - 4)) / 22);
        return clamp(0.46 + d * 0.5 - gleam(x, y) * 0.85, 0, 0.95);
      },
    });
    crossHatch(ctx, rimIn, {
      angles: [0.2, -1.2],
      spacing: 3.0,
      w: 0.55,
      o: 0.58,
      chunk: [5, 26],
      gap: [3, 14],
      density: (x, y) => clamp(0.55 - gleam(x, y) * 0.95, 0, 0.88),
    });
    brokenContour(ctx, ellipsePoly(CX, rimY + 2, 80, 20, 0, 40), {
      w: 0.7,
      o: 0.44,
      chunk: [10, 44],
      gap: [8, 40],
      wobble: 0.6,
    });

    hatch(ctx, bodyPoly, {
      angle: 1.5,
      spacing: 3.2,
      w: 0.6,
      o: 0.54,
      chunk: [6, 30],
      gap: [3, 16],
      density: (x, y) =>
        clamp(0.14 + Math.pow(Math.abs(x - (CX + 14)) / 100, 1.5) * 0.85 + (y - rimY) / 300, 0, 0.92),
    });
    hatch(ctx, bodyPoly, {
      angle: 0.1,
      spacing: 5.2,
      w: 0.5,
      o: 0.42,
      chunk: [10, 46],
      gap: [8, 40],
      density: (x, y) => clamp(Math.pow(Math.abs(x - (CX + 14)) / 100, 2.2) * 0.75, 0, 0.6),
    });
    brokenContour(ctx, rim, { w: 1.7, o: 0.88, chunk: [44, 210], gap: [2, 10], wobble: 0.4 });
    brokenContour(ctx, rimIn, { w: 0.95, o: 0.6, chunk: [26, 130], gap: [4, 20], wobble: 0.4 });
    brokenContour(ctx, bodyL, { w: 1.6, o: 0.82, chunk: [30, 150], gap: [2, 12] });
    brokenContour(ctx, bodyR, { w: 1.6, o: 0.82, chunk: [30, 150], gap: [2, 12] });
    brokenContour(ctx, halfArc(CX, rimY + 108, 50, 13, 'front', 30), {
      w: 1.4,
      o: 0.78,
      chunk: [24, 110],
      gap: [3, 14],
    });

    /* handle */
    {
      const h = tube(
        smooth([[CX + 96, rimY + 20], [CX + 152, rimY + 28], [CX + 158, rimY + 66], [CX + 104, rimY + 80]], false, 8),
        10,
        8
      );
      hatch(ctx, h, { angle: 0.6, spacing: 2.7, w: 0.55, o: 0.52, chunk: [4, 18], gap: [3, 12], density: 0.62 });
      brokenContour(ctx, h, { w: 1.4, o: 0.8, chunk: [24, 110], gap: [3, 14] });
    }

    /* saucer */
    {
      const sTop = ellipsePoly(CX, rimY + 122, 160, 39, 0, 56);
      hatch(ctx, sTop, {
        angle: 0.04,
        spacing: 3.8,
        w: 0.55,
        o: 0.46,
        chunk: [8, 40],
        gap: [5, 26],
        density: (x, y) =>
          clamp(0.1 + (y - (rimY + 108)) / 74 + Math.pow(Math.abs(x - (CX + 24)) / 160, 2) * 0.55, 0, 0.82),
      });
      brokenContour(ctx, sTop, { w: 1.5, o: 0.82, chunk: [44, 210], gap: [2, 12], wobble: 0.5 });
      brokenContour(ctx, ellipsePoly(CX, rimY + 126, 148, 35, 0, 48), {
        w: 0.75,
        o: 0.48,
        chunk: [22, 110],
        gap: [6, 28],
      });
      brokenContour(ctx, halfArc(CX, rimY + 132, 152, 36, 'front', 30), {
        w: 1.2,
        o: 0.68,
        chunk: [24, 120],
        gap: [3, 16],
      });
      const sh = ellipsePoly(CX - 52, rimY + 144, 192, 34, -0.04, 40);
      hatch(ctx, sh, {
        angle: 0.06,
        spacing: 2.9,
        w: 0.6,
        o: 0.58,
        chunk: [10, 50],
        gap: [3, 16],
        density: (x, y) => clamp(0.9 - Math.abs(x - (CX - 52)) / 196 - Math.abs(y - (rimY + 144)) / 34, 0, 0.88),
      });
      hatch(ctx, sh, { angle: -1.0, spacing: 4.4, w: 0.55, o: 0.46, chunk: [7, 30], gap: [5, 24], density: 0.45 });
    }

    /* steam */
    for (const off of [-34, 24]) {
      const pts = [];
      for (let i = 0; i <= 14; i++) {
        const t = i / 14;
        pts.push([CX + off + Math.sin(t * 4.2 + off) * 18 * t, rimY - 24 - t * 160]);
      }
      walkChunks(ctx, smooth(pts, false, 4), {
        w: 0.6,
        o: 0.3,
        chunk: [12, 46],
        gap: [12, 52],
        wobble: 0.9,
        density: (x, y) => clamp(1 - (rimY - 24 - y) / 180, 0, 0.75),
      });
    }
  }

  /* --- scattered beans --------------------------------------------------------- */
  const bean = (x, y, s, rot) => {
    const rx = 19 * s;
    const ry = 13 * s;
    const p = ellipsePoly(x, y, rx, ry, rot, 28);
    const d = (px, py) => {
      const dx = (px - x) * Math.cos(rot) + (py - y) * Math.sin(rot);
      const dy = -(px - x) * Math.sin(rot) + (py - y) * Math.cos(rot);
      return clamp(0.16 + dy / (ry * 1.5) + Math.abs(dx) / (rx * 2.2), 0, 0.92);
    };
    hatch(ctx, p, { angle: rot + 1.3, spacing: 2.1, w: 0.55, o: 0.56, chunk: [4, 16], gap: [2, 9], density: d });
    hatch(ctx, p, {
      angle: rot + 0.2,
      spacing: 3.4,
      w: 0.5,
      o: 0.48,
      chunk: [3, 13],
      gap: [3, 13],
      density: (px, py) => clamp(d(px, py) - 0.45, 0, 0.85),
    });
    stipple(ctx, p, { count: Math.round(110 * s), r: [0.26, 0.64], o: [0.2, 0.5], density: 0.5 });
    brokenContour(ctx, p, { w: 1.2, o: 0.8, chunk: [12, 52], gap: [2, 12], wobble: 0.35 });
    const cr = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const u = lerp(-rx * 0.86, rx * 0.86, t);
      const v = Math.sin(t * Math.PI * 2) * ry * 0.22;
      cr.push([x + Math.cos(rot) * u - Math.sin(rot) * v, y + Math.sin(rot) * u + Math.cos(rot) * v]);
    }
    penStroke(ctx, smooth(cr, false, 4), { w: 1.15, o: 0.78, wobble: 0.25, step: 5 });
    const sh = ellipsePoly(x - rx * 0.3, y + ry * 0.82, rx * 1.05, ry * 0.32, rot * 0.3, 20);
    hatch(ctx, sh, { angle: 0.05, spacing: 2.3, w: 0.55, o: 0.54, chunk: [5, 24], gap: [2, 10], density: 0.72 });
  };

  {
    const placed = [];
    const tryBean = (x, y, s) => {
      if (y < TABLE + 24 || y > FR.y1 - 14 || x < FR.x0 + 24 || x > FR.x1 - 24) return;
      /* keep clear of the sack's foot and the saucer */
      if (x > 268 && x < 664 && y < 690) return;
      if (x > 748 && x < 1108 && y < 648) return;
      for (const p of placed) if (Math.hypot(p[0] - x, p[1] - y) < 44) return;
      placed.push([x, y]);
      bean(x, y, s, rng.range(-1.3, 1.3));
    };
    /* the spill that says the sack was just filled */
    for (let i = 0; i < 20; i++) tryBean(462 + rng.gauss(0, 132), 706 + rng.gauss(0, 15), rng.range(0.82, 1.18));
    for (let i = 0; i < 10; i++) tryBean(180 + rng.gauss(0, 92), 668 + rng.gauss(0, 30), rng.range(0.74, 1.05));
    /* a looser scatter elsewhere */
    for (let i = 0; i < 30; i++)
      tryBean(rng.range(FR.x0 + 30, FR.x1 - 30), rng.range(TABLE + 28, FR.y1 - 18), rng.range(0.72, 1.1));
  }
}

/* ===========================================================================
 * 12. drive
 * ========================================================================= */

const SCENES = [
  {
    key: 'cultivo',
    seed: 0x0c0ffee1,
    draw: drawCultivo,
    title: 'Cultivo — ilustración provisional',
    aria:
      'Ilustración provisional a plumilla: cafetales sembrados en curvas de nivel sobre una ladera empinada, con una rama de café cargada de cerezas en primer plano.',
    desc:
      'Dibujo generado proceduralmente en tinta verde sobre papel claro. Sustituye de forma provisional una fotografía de la finca.',
  },
  {
    key: 'cosecha',
    seed: 0x0c0ffee2,
    draw: drawCosecha,
    title: 'Cosecha — ilustración provisional',
    aria:
      'Ilustración provisional a plumilla: manos y un canasto de fibra colmado de cerezas de café maduras.',
    desc:
      'Dibujo generado proceduralmente en tinta verde sobre papel claro. Sustituye de forma provisional una fotografía de la finca.',
  },
  {
    key: 'beneficio',
    seed: 0x0c0ffee3,
    draw: drawBeneficio,
    title: 'Beneficio — ilustración provisional',
    aria:
      'Ilustración provisional a plumilla: el beneficiadero, con tanques de fermentación, canal de lavado y una despulpadora con su volante.',
    desc:
      'Dibujo generado proceduralmente en tinta verde sobre papel claro. Sustituye de forma provisional una fotografía de la finca.',
  },
  {
    key: 'secado',
    seed: 0x0c0ffee4,
    draw: drawSecado,
    title: 'Secado — ilustración provisional',
    aria:
      'Ilustración provisional a plumilla: café pergamino rastrillado en hileras sobre un patio de secado, visto en escorzo bajo un sol alto.',
    desc:
      'Dibujo generado proceduralmente en tinta verde sobre papel claro. Sustituye de forma provisional una fotografía de la finca.',
  },
  {
    key: 'empaque',
    seed: 0x0c0ffee5,
    draw: drawEmpaque,
    title: 'Empaque — ilustración provisional',
    aria:
      'Ilustración provisional a plumilla: un saco de café terminado con una etiqueta deliberadamente en blanco, una taza y granos dispersos.',
    desc:
      'Dibujo generado proceduralmente en tinta verde sobre papel claro. La etiqueta se deja en blanco a propósito.',
  },
];

function makeCtx(seed) {
  const rng = new Rng(seed);
  return {
    rng,
    ink: new Ink(),
    noise: makeNoise1(new Rng(seed ^ 0x9e3779b9)),
    n2: makeNoise2(new Rng(seed ^ 0x85ebca6b)),
  };
}

function run() {
  const report = [];
  for (const scene of SCENES) {
    const t0 = Date.now();
    const ctx = makeCtx(scene.seed);
    scene.draw(ctx);
    drawFrame(ctx);
    const subject = ctx.ink.count;

    const plateCtx = {
      rng: new Rng(scene.seed ^ 0xc2b2ae35),
      ink: new Ink(),
      noise: makeNoise1(new Rng(scene.seed ^ 0x27d4eb2f)),
      n2: ctx.n2,
    };
    drawCaption(plateCtx);

    const doc = assemble(scene, ctx.ink, plateCtx.ink);
    const dir = join(OUT_BASE, scene.key);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${scene.key}-reference.svg`);
    writeFileSync(file, doc, 'utf8');
    const kb = statSync(file).size / 1024;
    report.push({
      scene: scene.key,
      marks: subject + plateCtx.ink.count,
      buckets: ctx.ink.buckets.size,
      kb: Math.round(kb * 10) / 10,
      ms: Date.now() - t0,
    });
  }
  console.table(report);
  const total = report.reduce((a, r) => a + r.marks, 0);
  console.log(`total marks: ${total}`);
}

run();
