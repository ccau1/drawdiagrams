// Element renderers: built-in shapes, parametric plugin shapes (UML) and
// SVG icons. Roughness adds deterministic sketchy jitter from el.seed.
import type { El, HeadType } from "../types";
import { elMidpoint, linePath } from "./scene";

// Deterministic PRNG so sketchy rendering is stable across frames/peers.
function mulberry32(seed: number) {
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
  // sketchy path: subdivide and jitter
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

// Pencil-drawn look (à la rough.js): two jittered strokes per path, the
// second one also wobbling the endpoints so corners don't line up perfectly.
function sketchStroke(ctx: CanvasRenderingContext2D, el: El, rand: () => number, pts: number[][]) {
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

/** Split a polyline into sub-polylines with a rectangular gap around
 *  (cx, cy) — used to break a line/arrow around its label. */
function splitAroundLabel(
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
function labelGap(el: El, hideText: boolean): { cx: number; cy: number; hw: number; hh: number } | null {
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

/** Closed polygon with rounded corners, sampled to a polyline so it gets
 *  the same pencil stroke as everything else. */
function roundedPoly(pts: number[][], r: number): number[][] {
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
  out.push(out[0]); // close
  return out;
}

// Arrowhead shapes. `angle` is the direction of travel into the tip.
function drawHead(
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

// Centered multi-line label for basic shapes (set via double-click editing).
function centerText(ctx: CanvasRenderingContext2D, el: El) {
  if (!el.text) return;
  const size = el.fontSize || 16;
  ctx.save();
  ctx.fillStyle = el.stroke;
  ctx.globalAlpha = el.opacity;
  ctx.font = `${size}px 'Segoe UI', system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = el.text.split("\n");
  const cx = el.x + el.w / 2, cy = el.y + el.h / 2, lh = size * 1.3;
  lines.forEach((line, i) => ctx.fillText(line, cx, cy + (i - (lines.length - 1) / 2) * lh));
  ctx.restore();
}

export function drawElement(ctx: CanvasRenderingContext2D, el: El, hideText = false) {
  ctx.save();
  applyStroke(ctx, el);
  const rand = mulberry32(el.seed);
  const { x, y, w, h } = el;

  switch (el.type) {
    case "rect": {
      const base = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
      const round = el.edges === "round";
      const path = round
        ? roundedPoly(base, Math.min(16, Math.abs(w) / 4, Math.abs(h) / 4))
        : [...base, base[0]];
      if (el.fill !== "transparent") {
        ctx.fillStyle = el.fill;
        ctx.beginPath();
        ctx.moveTo(path[0][0], path[0][1]);
        for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
        ctx.closePath(); ctx.fill();
      }
      sketchStroke(ctx, el, rand, path);
      if (!hideText) centerText(ctx, el);
      break;
    }
    case "diamond": {
      const cx = x + w / 2, cy = y + h / 2;
      const base = [[cx, y], [x + w, cy], [cx, y + h], [x, cy]];
      const round = el.edges === "round";
      const path = round
        ? roundedPoly(base, Math.min(16, Math.abs(w) / 4, Math.abs(h) / 4))
        : [...base, base[0]];
      if (el.fill !== "transparent") {
        ctx.fillStyle = el.fill;
        ctx.beginPath();
        ctx.moveTo(path[0][0], path[0][1]);
        for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
        ctx.closePath(); ctx.fill();
      }
      sketchStroke(ctx, el, rand, path);
      if (!hideText) centerText(ctx, el);
      break;
    }
    case "ellipse": {
      // approximate with a polygon so it can be jittered like other strokes
      const cx = x + w / 2, cy = y + h / 2;
      const rx = Math.abs(w / 2), ry = Math.abs(h / 2);
      const N = 32, pts: number[][] = [];
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
      }
      if (el.fill !== "transparent") {
        ctx.fillStyle = el.fill;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath(); ctx.fill();
      }
      sketchStroke(ctx, el, rand, pts);
      if (!hideText) centerText(ctx, el);
      break;
    }
    case "line": case "arrow": case "freedraw": {
      const pts = el.points || [0, 0];
      if (el.type === "freedraw") {
        ctx.beginPath();
        ctx.moveTo(x + (pts[0] || 0), y + (pts[1] || 0));
        for (let i = 2; i + 1 < pts.length; i += 2)
          ctx.lineTo(x + pts[i], y + pts[i + 1]);
        ctx.stroke();
      } else {
        const arr: number[][] = [];
        for (let i = 0; i + 1 < pts.length; i += 2) arr.push([x + pts[i], y + pts[i + 1]]);
        // routed path: bezier samples for curves, orthogonal legs for elbows
        const path = linePath(el) ?? (arr.length > 1 ? arr : null);
        if (path) {
          // the label punches a gap in the stroke (still one element)
          const gap = labelGap(el, hideText);
          const pieces = gap ? splitAroundLabel(path, gap.cx, gap.cy, gap.hw, gap.hh) : [path];
          for (const p of pieces) sketchStroke(ctx, el, rand, p);
        } else if (arr.length === 1) {
          ctx.beginPath();
          ctx.moveTo(arr[0][0], arr[0][1]);
          ctx.lineTo(arr[0][0], arr[0][1]);
          ctx.stroke();
        }
        // heads follow the tangents at the ends of the routed path
        if (el.type === "arrow" && path && path.length >= 2) {
          const n = path.length;
          drawHead(ctx, el, path[n - 1][0], path[n - 1][1],
            Math.atan2(path[n - 1][1] - path[n - 2][1], path[n - 1][0] - path[n - 2][0]),
            el.headEnd ?? "arrow");
          drawHead(ctx, el, path[0][0], path[0][1],
            Math.atan2(path[0][1] - path[1][1], path[0][0] - path[1][0]),
            el.headStart ?? "none");
        }
      }
      // label anchored at the midpoint, draggable via labelDx/labelDy
      if (!hideText && el.text && el.type !== "freedraw") {
        const m = elMidpoint(el);
        const fs = el.fontSize || 16;
        ctx.save();
        ctx.fillStyle = el.stroke;
        ctx.globalAlpha = el.opacity;
        ctx.font = `${fs}px 'Segoe UI', system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const lines = el.text.split("\n");
        const ax = m.x + (el.labelDx || 0), ay = m.y + (el.labelDy || 0);
        lines.forEach((line, i) =>
          ctx.fillText(line, ax, ay + (i - (lines.length - 1) / 2) * fs * 1.3));
        ctx.restore();
      }
      break;
    }
    case "text": {
      if (hideText) break;
      ctx.globalAlpha = el.opacity;
      ctx.fillStyle = el.stroke;
      ctx.font = `${el.fontSize || 20}px 'Segoe UI', system-ui, sans-serif`;
      ctx.textBaseline = "top";
      for (const [i, line] of (el.text || "").split("\n").entries())
        ctx.fillText(line, x, y + i * (el.fontSize || 20) * 1.3);
      break;
    }
    case "icon": {
      const img = el.svg ? iconImage(el.svg, el.stroke) : null;
      ctx.globalAlpha = el.opacity;
      if (img) ctx.drawImage(img, x, y, w, h);
      else { ctx.strokeRect(x, y, w, h); }
      break;
    }
    case "shape": {
      drawParametric(ctx, el, rand, hideText);
      break;
    }
  }
  ctx.restore();
}

// Parametric renderers declared by integrations (kind "shape").
function drawParametric(ctx: CanvasRenderingContext2D, el: El, rand: () => number, hideText = false) {
  const { x, y, w, h } = el;
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    sketchStroke(ctx, el, rand, [[x0, y0], [x1, y1]]);
  };
  const label = (t: string, tx: number, ty: number, size = 14, bold = false) => {
    if (hideText && el.text) return; // suppressed while the element is being edited
    ctx.save();
    ctx.fillStyle = el.stroke; ctx.globalAlpha = el.opacity;
    ctx.font = `${bold ? "600 " : ""}${size}px 'Segoe UI', system-ui, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(t, tx, ty);
    ctx.restore();
  };
  switch (el.shape) {
    case "uml-class": case "uml-interface": {
      const hh = 30;
      if (el.fill !== "transparent") { ctx.fillStyle = el.fill; ctx.fillRect(x, y, w, h); }
      sketchStroke(ctx, el, rand, [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]);
      line(x, y + hh, x + w, y + hh);
      line(x, y + h * 0.62, x + w, y + h * 0.62);
      label(el.text || (el.shape === "uml-interface" ? "«interface»" : "Class"), x + w / 2, y + hh / 2, 14, true);
      if (el.shape === "uml-interface") label("«interface»", x + w / 2, y + hh / 2 - 12, 10);
      break;
    }
    case "uml-actor": {
      const cx = x + w / 2;
      ctx.beginPath(); ctx.arc(cx, y + h * 0.14, h * 0.12, 0, Math.PI * 2); ctx.stroke();
      line(cx, y + h * 0.26, cx, y + h * 0.62);
      line(cx - w * 0.3, y + h * 0.36, cx + w * 0.3, y + h * 0.36);
      line(cx, y + h * 0.62, cx - w * 0.28, y + h * 0.95);
      line(cx, y + h * 0.62, cx + w * 0.28, y + h * 0.95);
      label(el.text || "Actor", cx, y + h + 8, 12);
      break;
    }
    case "uml-usecase": {
      ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      if (el.fill !== "transparent") { ctx.fillStyle = el.fill; ctx.fill(); }
      ctx.stroke();
      label(el.text || "Use case", x + w / 2, y + h / 2);
      break;
    }
    case "uml-package": {
      const tab = w * 0.4, th = 16;
      if (el.fill !== "transparent") { ctx.fillStyle = el.fill; ctx.fillRect(x, y + th, w, h - th); }
      sketchStroke(ctx, el, rand, [[x, y], [x + tab, y], [x + tab, y + th], [x, y + th], [x, y]]);
      sketchStroke(ctx, el, rand, [[x, y + th], [x + w, y + th], [x + w, y + h], [x, y + h], [x, y + th]]);
      label(el.text || "Package", x + tab / 2, y + th / 2, 11);
      break;
    }
    case "uml-note": {
      const fold = 14;
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + w - fold, y); ctx.lineTo(x + w, y + fold);
      ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
      if (el.fill !== "transparent") { ctx.fillStyle = el.fill; ctx.fill(); }
      ctx.stroke();
      line(x + w - fold, y, x + w - fold, y + fold);
      line(x + w - fold, y + fold, x + w, y + fold);
      label(el.text || "note", x + w / 2, y + h / 2, 12);
      break;
    }
    case "uml-component": {
      if (el.fill !== "transparent") { ctx.fillStyle = el.fill; ctx.fillRect(x + 10, y, w - 10, h); }
      ctx.strokeRect(x + 10, y, w - 10, h);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.strokeRect(x, y + h * 0.25, 12, h * 0.18);
      ctx.strokeRect(x, y + h * 0.57, 12, h * 0.18);
      label(el.text || "Component", x + w / 2 + 5, y + h / 2);
      break;
    }
    case "uml-lifeline": {
      const cx = x + w / 2;
      if (el.fill !== "transparent") { ctx.fillStyle = el.fill; ctx.fillRect(cx - 40, y, 80, 28); }
      ctx.strokeRect(cx - 40, y, 80, 28);
      label(el.text || "Object", cx, y + 14, 12);
      ctx.save();
      ctx.setLineDash([6, 5]);
      line(cx, y + 28, cx, y + h);
      ctx.restore();
      break;
    }
    case "uml-frame": {
      sketchStroke(ctx, el, rand, [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]);
      const tw = 60, thh = 20;
      sketchStroke(ctx, el, rand, [[x, y], [x + tw, y], [x + tw, y + thh], [x, y + thh], [x, y]]);
      label(el.text || "sd", x + tw / 2, y + thh / 2, 11, true);
      break;
    }
    default: {
      ctx.strokeRect(x, y, w, h);
      label(el.text || el.shape || "shape", x + w / 2, y + h / 2, 12);
    }
  }
}
