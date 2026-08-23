// Shared canvas rendering utilities used by individual Shape files.
import type { El, HeadType } from "../types";
import { elMidpoint, linePath } from "./shape";

const measureCtx = document.createElement("canvas").getContext("2d")!;
export function measureTextWidth(text: string, fontSize: number): number {
  measureCtx.font = `${fontSize}px 'Segoe UI', system-ui, sans-serif`;
  return measureCtx.measureText(text).width;
}

// Deterministic PRNG so sketchy rendering is stable across frames/peers.
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function applyStroke(ctx: CanvasRenderingContext2D, el: El) {
  ctx.strokeStyle = el.stroke;
  ctx.lineWidth = el.strokeWidth;
  ctx.globalAlpha = el.opacity;
  const st = el.strokeType ?? (el.dashed ? "dashed" : "solid");
  ctx.setLineDash(
    st === "dashed" ? [el.strokeWidth * 4, el.strokeWidth * 3]
    : st === "dotted" ? [0.1, el.strokeWidth * 2.5]
    : []);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
}

function j(ctx: CanvasRenderingContext2D, el: El, rand: () => number, pts: number[][], wobbleEnds = false) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const segs = el.roughness > 0 ? 4 : 1;
    for (let s = 1; s <= segs; s++) {
      const t = s / segs;
      const off = el.roughness;
      const ox = (rand() - 0.5) * off * 3 * (s === segs && !wobbleEnds ? 0 : 1);
      const oy = (rand() - 0.5) * off * 3 * (s === segs && !wobbleEnds ? 0 : 1);
      ctx.lineTo(x0 + (x1 - x0) * t + ox, y0 + (y1 - y0) * t + oy);
    }
  }
}

// Pencil-drawn look (à la rough.js): two jittered strokes per path.
export function sketchStroke(ctx: CanvasRenderingContext2D, el: El, rand: () => number, pts: number[][]) {
  j(ctx, el, rand, pts);
  ctx.stroke();
  if (el.roughness > 0) {
    ctx.save();
    ctx.globalAlpha = el.opacity * 0.6;
    j(ctx, el, rand, pts, true);
    ctx.stroke();
    ctx.restore();
  }
}

const iconCache = new Map<string, HTMLImageElement | "loading">();
export function iconImage(svgBody: string, stroke: string): HTMLImageElement | null {
  const key = stroke + "|" + svgBody;
  const hit = iconCache.get(key);
  if (hit && hit !== "loading") return hit;
  if (hit === "loading") return null;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    svgBody.replace(/#232f3e/g, stroke) + `</svg>`;
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  iconCache.set(key, "loading");
  img.onload = () => iconCache.set(key, img);
  img.onerror = () => iconCache.delete(key);
  return null;
}

// Async cache for pasted raster images (base64 data URLs).
const pastedImageCache = new Map<string, HTMLImageElement | "loading">();
const imageLoadListeners = new Set<() => void>();
export function onPastedImageLoad(cb: () => void) {
  imageLoadListeners.add(cb);
  return () => { imageLoadListeners.delete(cb); };
}
export function pastedImage(src: string): HTMLImageElement | null {
  const hit = pastedImageCache.get(src);
  if (hit && hit !== "loading") return hit;
  if (hit === "loading") return null;
  const img = new Image();
  img.src = src;
  pastedImageCache.set(src, "loading");
  img.onload = () => { pastedImageCache.set(src, img); imageLoadListeners.forEach((f) => f()); };
  img.onerror = () => pastedImageCache.delete(src);
  return null;
}

/** Split a polyline into sub-polylines with a rectangular gap around
 *  (cx, cy) — used to break a line/arrow around its label. */
export function splitAroundLabel(
  pts: number[][], cx: number, cy: number, hw: number, hh: number,
): number[][][] {
  const inside = (x: number, y: number) => Math.abs(x - cx) < hw && Math.abs(y - cy) < hh;
  const out: number[][][] = [];
  let cur: number[][] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const crosses = inside(a[0], a[1]) || inside(b[0], b[1]) ||
      inside((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    if (crosses) {
      if (cur.length > 1) out.push(cur);
      cur = [];
    } else {
      if (!cur.length) cur.push(a);
      cur.push(b);
    }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

/** Label gap box for a line/arrow, or null when the label should not break
 *  the stroke (no text, or being edited). */
export function labelGap(el: El, hideText: boolean | string): { cx: number; cy: number; hw: number; hh: number } | null {
  if (hideText || !el.text) return null;
  const m = elMidpoint(el);
  const fs = el.fontSize || 16;
  const lines = el.text.split("\n");
  return {
    cx: m.x + (el.labelDx || 0),
    cy: m.y + (el.labelDy || 0),
    hw: Math.max(...lines.map((l) => l.length), 1) * fs * 0.32 + 8,
    hh: (lines.length * fs * 1.3) / 2 + 3,
  };
}

/** Closed polygon with rounded corners, sampled to a polyline. */
export function roundedPoly(pts: number[][], r: number): number[][] {
  const out: number[][] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n], cur = pts[i], next = pts[(i + 1) % n];
    const d1 = Math.hypot(prev[0] - cur[0], prev[1] - cur[1]) || 1;
    const d2 = Math.hypot(next[0] - cur[0], next[1] - cur[1]) || 1;
    const rr = Math.min(r, d1 / 2, d2 / 2);
    const a = [cur[0] + ((prev[0] - cur[0]) / d1) * rr, cur[1] + ((prev[1] - cur[1]) / d1) * rr];
    const b = [cur[0] + ((next[0] - cur[0]) / d2) * rr, cur[1] + ((next[1] - cur[1]) / d2) * rr];
    for (let s = 0; s <= 4; s++) {
      const t = s / 4, u = 1 - t;
      out.push([
        u * u * a[0] + 2 * u * t * cur[0] + t * t * b[0],
        u * u * a[1] + 2 * u * t * cur[1] + t * t * b[1],
      ]);
    }
  }
  out.push(out[0]);
  return out;
}

// Arrowhead shapes. `angle` is the direction of travel into the tip.
export function drawHead(
  ctx: CanvasRenderingContext2D, el: El,
  tipX: number, tipY: number, angle: number, type: HeadType,
) {
  if (type === "none") return;
  const len = 10 + el.strokeWidth * 3;
  if (type === "arrow") {
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - len * Math.cos(angle - 0.42), tipY - len * Math.sin(angle - 0.42));
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - len * Math.cos(angle + 0.42), tipY - len * Math.sin(angle + 0.42));
    ctx.stroke();
    return;
  }
  ctx.save();
  ctx.fillStyle = el.stroke;
  ctx.globalAlpha = el.opacity;
  if (type === "triangle") {
    const bx = tipX - len * Math.cos(angle), by = tipY - len * Math.sin(angle);
    const nx = Math.cos(angle + Math.PI / 2), ny = Math.sin(angle + Math.PI / 2);
    const hw = len * 0.55;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(bx + nx * hw, by + ny * hw);
    ctx.lineTo(bx - nx * hw, by - ny * hw);
    ctx.closePath();
    ctx.fill();
  } else if (type === "dot") {
    const r = 3 + el.strokeWidth;
    ctx.beginPath();
    ctx.arc(tipX - r * Math.cos(angle), tipY - r * Math.sin(angle), r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Multi-line label for basic shapes, honoring textAlign and textVerticalAlign.
export function centerText(ctx: CanvasRenderingContext2D, el: El) {
  if (!el.text) return;
  const size = el.fontSize || 16;
  ctx.save();
  ctx.fillStyle = el.stroke;
  ctx.globalAlpha = el.opacity;
  ctx.font = `${size}px 'Segoe UI', system-ui, sans-serif`;
  ctx.textAlign = el.textAlign ?? "center";
  ctx.textBaseline = "middle";
  const lines = el.text.split("\n");
  const align = el.textAlign ?? "center";
  const x0 = align === "left" ? el.x + 8 : align === "right" ? el.x + el.w - 8 : el.x + el.w / 2;
  const vAlign = el.textVerticalAlign ?? "middle";
  const lh = size * 1.3;
  const blockH = lines.length * lh;
  const inset = 8;
  let y0: number;
  if (vAlign === "top") {
    y0 = el.y + inset + lh / 2;
  } else if (vAlign === "bottom") {
    y0 = el.y + el.h - inset - blockH + lh / 2;
  } else {
    y0 = el.y + el.h / 2 - blockH / 2 + lh / 2;
  }
  lines.forEach((line, i) => ctx.fillText(line, x0, y0 + i * lh));
  ctx.restore();
}

/** Shared renderer for line and arrow — the only difference is the heads. */
export function drawLineOrArrow(ctx: CanvasRenderingContext2D, el: El, hideText: boolean | string = false, isArrow = false) {
  applyStroke(ctx, el);
  const rand = mulberry32(el.seed);
  const pts = el.points || [0, 0];
  const arr: number[][] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) arr.push([el.x + pts[i], el.y + pts[i + 1]]);
  const path = linePath(el) ?? (arr.length > 1 ? arr : null);
  if (path) {
    const gap = labelGap(el, hideText);
    const pieces = gap ? splitAroundLabel(path, gap.cx, gap.cy, gap.hw, gap.hh) : [path];
    for (const p of pieces) sketchStroke(ctx, el, rand, p);
  } else if (arr.length === 1) {
    ctx.beginPath();
    ctx.moveTo(arr[0][0], arr[0][1]);
    ctx.lineTo(arr[0][0], arr[0][1]);
    ctx.stroke();
  }
  if (isArrow && path && path.length >= 2) {
    const n = path.length;
    drawHead(ctx, el, path[n - 1][0], path[n - 1][1],
      Math.atan2(path[n - 1][1] - path[n - 2][1], path[n - 1][0] - path[n - 2][0]),
      el.headEnd ?? "arrow");
    drawHead(ctx, el, path[0][0], path[0][1],
      Math.atan2(path[0][1] - path[1][1], path[0][0] - path[1][0]),
      el.headStart ?? "none");
  }
  if (!hideText && el.text) {
    const m = elMidpoint(el);
    const fs = el.fontSize || 16;
    ctx.save();
    ctx.fillStyle = el.stroke;
    ctx.globalAlpha = el.opacity;
    ctx.font = `${fs}px 'Segoe UI', system-ui, sans-serif`;
    const align = el.textAlign ?? "center";
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    const lines = el.text.split("\n");
    const maxW = Math.max(...lines.map((l) => ctx.measureText(l).width), 0);
    const pad = 4;
    let ax = m.x + (el.labelDx || 0);
    if (align === "left") ax -= maxW / 2 + pad;
    else if (align === "right") ax += maxW / 2 + pad;
    const ay = m.y + (el.labelDy || 0);
    lines.forEach((line, i) =>
      ctx.fillText(line, ax, ay + (i - (lines.length - 1) / 2) * fs * 1.3));
    ctx.restore();
  }
}
