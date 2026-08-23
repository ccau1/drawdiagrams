// Unified shape geometry + strategy class. Every `El.type` maps to one
// `Shape` instance that knows how to render, bound, hit-test, and resize
// itself. `El` stays a plain data record; `Shape` is runtime behavior.
import type { El, LineKind } from "../types";
import { measureTextWidth } from "./draw-utils";

export type BBox = { x0: number; y0: number; x1: number; y1: number };

export type HandleRole = "corner" | "edge" | "vertex" | "label";

export interface Handle {
  index: number;          // 0..N-1 within this shape's handle list
  x: number; y: number;   // world-space position
  role: HandleRole;
  // For "corner" and "edge" handles on bbox shapes: which sides move.
  left?: boolean; right?: boolean; top?: boolean; bottom?: boolean;
}

export type HandleOpts = { shiftKey?: boolean };

/** Target returned by a shape's doubleClick hook so the Board can open the
 *  text editor at the right place and write the value back to the right field. */
export interface TextEditTarget {
  x: number; y: number;
  value: string;
  field?: string;        // key in el.data; omitted means el.text
  align?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  multiline?: boolean;   // allow Enter to insert newlines
  width?: number;        // optional editor width in world units
}

export class Shape {
  constructor(public spec: {
    id: string;
    fixedRatio?: boolean;
    render: (ctx: CanvasRenderingContext2D, el: El, hideText?: boolean | string) => void;
    bounds: (el: El) => BBox;
    hitTest: (el: El, wx: number, wy: number, tol: number) => boolean;
    handles: (el: El) => Handle[];
    applyHandle: (orig: El, handle: Handle, wx: number, wy: number, opts: HandleOpts) => Partial<El> | null;
    snapKeyPoints?: (el: El) => number[][];
    normalize?: (el: El) => El | null;
    doubleClick?: (el: El, wx: number, wy: number) => TextEditTarget | null;
  }) {}

  get id() { return this.spec.id; }
  get fixedRatio() { return this.spec.fixedRatio ?? false; }

  render(ctx: CanvasRenderingContext2D, el: El, hideText: boolean | string = false) { this.spec.render(ctx, el, hideText); }
  bounds(el: El): BBox { return this.spec.bounds(el); }
  hitTest(el: El, wx: number, wy: number, tol: number): boolean { return this.spec.hitTest(el, wx, wy, tol); }
  handles(el: El): Handle[] { return this.spec.handles(el); }
  applyHandle(orig: El, handle: Handle, wx: number, wy: number, opts: HandleOpts = {}): Partial<El> | null {
    return this.spec.applyHandle(orig, handle, wx, wy, opts);
  }
  snapKeyPoints(el: El): number[][] { return this.spec.snapKeyPoints?.(el) ?? []; }
  normalize(el: El): El | null { return this.spec.normalize?.(el) ?? null; }
  doubleClick(el: El, wx: number, wy: number): TextEditTarget | null {
    return this.spec.doubleClick?.(el, wx, wy) ?? null;
  }
}

/** Default double-click target for a bbox shape: edit its centered text. */
export function bboxTextEditTarget(el: El): TextEditTarget {
  const size = el.fontSize || 16;
  const vAlign = el.textVerticalAlign ?? "middle";
  const inset = 8;
  let y: number;
  if (vAlign === "top") {
    y = el.y + inset;
  } else if (vAlign === "bottom") {
    const lines = (el.text || "").split("\n");
    const blockH = lines.length * size * 1.3;
    y = el.y + el.h - inset - blockH;
  } else {
    y = el.y + el.h / 2;
  }
  return { x: el.x + el.w / 2, y, value: el.text ?? "", align: el.textAlign ?? "center", verticalAlign: vAlign };
}

/** Default double-click target for a line/arrow: edit its label at the midpoint. */
export function lineLabelTarget(el: El): TextEditTarget {
  const m = elMidpoint(el);
  const align = el.textAlign ?? "center";
  let x = m.x + (el.labelDx || 0);
  if (align !== "center" && el.text) {
    const fs = el.fontSize || 16;
    const maxW = Math.max(...el.text.split("\n").map((l) => measureTextWidth(l, fs)), 0);
    const pad = 4;
    if (align === "left") x -= maxW / 2 + pad;
    if (align === "right") x += maxW / 2 + pad;
  }
  return { x, y: m.y + (el.labelDy || 0), value: el.text ?? "", align };
}

// ---------------------------------------------------------------------------
// Geometry helpers shared by many shapes.
// ---------------------------------------------------------------------------

export function lineKind(el: El): LineKind {
  return el.lineType ?? (el.curve ? "curve" : "sharp");
}

/** World-coords render path for a line/arrow, or null for a plain polyline
 *  (sharp). Curves sample a quadratic bezier through the middle control
 *  point; elbows route orthogonally through it. */
export function linePath(el: El): number[][] | null {
  const pts = el.points || [];
  if (pts.length !== 6) return null;
  const kind = lineKind(el);
  const [x0, y0, mx, my, x1, y1] = pts;
  if (kind === "curve") {
    const seg: number[][] = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20, u = 1 - t;
      seg.push([
        el.x + u * u * x0 + 2 * u * t * mx + t * t * x1,
        el.y + u * u * y0 + 2 * u * t * my + t * t * y1,
      ]);
    }
    return seg;
  }
  if (kind === "elbow") {
    if (Math.abs(x1 - x0) >= Math.abs(y1 - y0)) {
      return [[el.x + x0, el.y + y0], [el.x + mx, el.y + y0], [el.x + mx, el.y + y1], [el.x + x1, el.y + y1]];
    }
    return [[el.x + x0, el.y + y0], [el.x + x0, el.y + my], [el.x + x1, el.y + my], [el.x + x1, el.y + y1]];
  }
  return null;
}

/** Midpoint of a line/arrow in world coords, accounting for routing. */
export function elMidpoint(el: El): { x: number; y: number } {
  const pts = el.points || [0, 0, 0, 0];
  const kind = lineKind(el);
  if (kind === "curve" && pts.length === 6) {
    return {
      x: el.x + 0.25 * pts[0] + 0.5 * pts[2] + 0.25 * pts[4],
      y: el.y + 0.25 * pts[1] + 0.5 * pts[3] + 0.25 * pts[5],
    };
  }
  if (kind === "elbow" && pts.length === 6) {
    const [x0, y0, mx, my, x1, y1] = pts;
    if (Math.abs(x1 - x0) >= Math.abs(y1 - y0))
      return { x: el.x + mx, y: el.y + (y0 + y1) / 2 };
    return { x: el.x + (x0 + x1) / 2, y: el.y + my };
  }
  const verts = Math.floor(pts.length / 2);
  if (verts % 2 === 1) {
    const i = Math.floor(verts / 2) * 2;
    return { x: el.x + pts[i], y: el.y + pts[i + 1] };
  }
  const i = Math.max(0, (verts / 2 - 1) * 2);
  return { x: el.x + (pts[i] + pts[i + 2]) / 2, y: el.y + (pts[i + 1] + pts[i + 3]) / 2 };
}

export function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function closestOnSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const x = x1 + t * dx, y = y1 + t * dy;
  return { x, y, d: Math.hypot(px - x, py - y) };
}

// ---------------------------------------------------------------------------
// Default bbox-shape behavior (rect, ellipse, diamond, text, icon, etc.)
// ---------------------------------------------------------------------------

export function bboxBounds(el: El): BBox {
  const pad = el.strokeWidth + 4;
  return {
    x0: Math.min(el.x, el.x + el.w) - pad,
    y0: Math.min(el.y, el.y + el.h) - pad,
    x1: Math.max(el.x, el.x + el.w) + pad,
    y1: Math.max(el.y, el.y + el.h) + pad,
  };
}

export function rectHitTest(el: El, wx: number, wy: number, tol: number): boolean {
  const x0 = Math.min(el.x, el.x + el.w) - tol, x1 = Math.max(el.x, el.x + el.w) + tol;
  const y0 = Math.min(el.y, el.y + el.h) - tol, y1 = Math.max(el.y, el.y + el.h) + tol;
  return wx >= x0 && wx <= x1 && wy >= y0 && wy <= y1;
}

export function ellipseHitTest(el: El, wx: number, wy: number, tol: number): boolean {
  const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
  const rx = Math.abs(el.w) / 2 || 1, ry = Math.abs(el.h) / 2 || 1;
  const v = ((wx - cx) ** 2) / ((rx + tol) ** 2) + ((wy - cy) ** 2) / ((ry + tol) ** 2);
  if (el.fill !== "transparent") return v <= 1.15;
  return v <= 1.15 && v >= (rx * ry) / ((rx + tol) * (ry + tol)) * 0.7;
}

export function diamondHitTest(el: El, wx: number, wy: number, tol: number): boolean {
  const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
  const dx = Math.abs(wx - cx) / (Math.abs(el.w) / 2 + tol);
  const dy = Math.abs(wy - cy) / (Math.abs(el.h) / 2 + tol);
  return dx + dy <= 1.1;
}

/** 8 handles for a bbox shape, or 4 corners only when `cornersOnly` is true. */
export function bboxHandles(el: El, cornersOnly = false): Handle[] {
  const x0 = Math.min(el.x, el.x + el.w), x1 = Math.max(el.x, el.x + el.w);
  const y0 = Math.min(el.y, el.y + el.h), y1 = Math.max(el.y, el.y + el.h);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const handles: Handle[] = [
    { index: 0, x: x0, y: y0, role: "corner", left: true, top: true },
    { index: 1, x: cx, y: y0, role: "edge", top: true },
    { index: 2, x: x1, y: y0, role: "corner", right: true, top: true },
    { index: 3, x: x1, y: cy, role: "edge", right: true },
    { index: 4, x: x1, y: y1, role: "corner", right: true, bottom: true },
    { index: 5, x: cx, y: y1, role: "edge", bottom: true },
    { index: 6, x: x0, y: y1, role: "corner", left: true, bottom: true },
    { index: 7, x: x0, y: cy, role: "edge", left: true },
  ];
  if (cornersOnly) return handles.filter((h) => h.role === "corner");
  return handles;
}

/** Resize a bbox shape by dragging one handle. Supports fixed-ratio (icons)
 *  and shift-key constrained resize for free-ratio shapes. */
export function applyBboxHandle(
  orig: El, handle: Handle, wx: number, wy: number, opts: { fixedRatio?: boolean; shiftKey?: boolean },
): Partial<El> | null {
  const ox0 = Math.min(orig.x, orig.x + orig.w), ox1 = Math.max(orig.x, orig.x + orig.w);
  const oy0 = Math.min(orig.y, orig.y + orig.h), oy1 = Math.max(orig.y, orig.y + orig.h);
  let x0 = ox0, x1 = ox1, y0 = oy0, y1 = oy1;
  if (handle.left) x0 = wx;
  if (handle.right) x1 = wx;
  if (handle.top) y0 = wy;
  if (handle.bottom) y1 = wy;

  const preserveRatio = opts.fixedRatio || opts.shiftKey;
  if (preserveRatio) {
    const ow = Math.max(1, ox1 - ox0), oh = Math.max(1, oy1 - oy0);
    const ratio = ow / oh;
    let nw = Math.max(1, Math.abs(x1 - x0)), nh = Math.max(1, Math.abs(y1 - y0));
    // Decide which dimension to drive based on the larger movement.
    if (nw / nh > ratio) {
      nh = nw / ratio;
    } else {
      nw = nh * ratio;
    }
    // Anchor at the opposite side(s) from the dragged handle.
    if (handle.right) x1 = ox0 + nw;
    else if (handle.left) x0 = ox1 - nw;
    else { x0 = (ox0 + ox1) / 2 - nw / 2; x1 = x0 + nw; }

    if (handle.bottom) y1 = oy0 + nh;
    else if (handle.top) y0 = oy1 - nh;
    else { y0 = (oy0 + oy1) / 2 - nh / 2; y1 = y0 + nh; }
  }

  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.max(4, Math.abs(x1 - x0)),
    h: Math.max(4, Math.abs(y1 - y0)),
  };
}

/** Default 8 cardinal snap points for bbox shapes (corners + midpoints). */
export function bboxSnapKeyPoints(el: El): number[][] {
  const x0 = Math.min(el.x, el.x + el.w), x1 = Math.max(el.x, el.x + el.w);
  const y0 = Math.min(el.y, el.y + el.h), y1 = Math.max(el.y, el.y + el.h);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return [
    [x0, y0], [cx, y0], [x1, y0],
    [x1, cy], [x1, y1], [cx, y1],
    [x0, y1], [x0, cy],
  ];
}

// ---------------------------------------------------------------------------
// Polyline / line / arrow helpers.
// ---------------------------------------------------------------------------

export function pointsBounds(el: El): BBox {
  const pts = el.points || [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < pts.length; i += 2) {
    x0 = Math.min(x0, el.x + pts[i]); x1 = Math.max(x1, el.x + pts[i]);
    y0 = Math.min(y0, el.y + pts[i + 1]); y1 = Math.max(y1, el.y + pts[i + 1]);
  }
  const pad = el.strokeWidth * 2 + 4;
  if (!isFinite(x0)) return bboxBounds(el);
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}

export function lineHitTest(el: El, wx: number, wy: number, tol: number): boolean {
  const pts = el.points;
  if (!pts) return false;
  const path = linePath(el);
  if (path) {
    for (let i = 0; i + 1 < path.length; i++) {
      if (distToSeg(wx, wy, path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]) < tol) return true;
    }
    return false;
  }
  for (let i = 0; i + 3 < pts.length; i += 2) {
    if (distToSeg(wx, wy, el.x + pts[i], el.y + pts[i + 1], el.x + pts[i + 2], el.y + pts[i + 3]) < tol) return true;
  }
  return pts.length === 2 && Math.hypot(wx - (el.x + pts[0]), wy - (el.y + pts[1])) < tol;
}

export function polylineHandles(el: El): Handle[] {
  const pts = el.points || [];
  const out: Handle[] = [];
  for (let i = 0, n = 0; i + 1 < pts.length; i += 2, n++) {
    out.push({ index: n, x: el.x + pts[i], y: el.y + pts[i + 1], role: "vertex" });
  }
  return out;
}

export function applyPolylineHandle(orig: El, handle: Handle, wx: number, wy: number): Partial<El> | null {
  const pts = orig.points ? [...orig.points] : [];
  const i = handle.index * 2;
  if (i + 1 >= pts.length) return null;
  pts[i] = wx - orig.x;
  pts[i + 1] = wy - orig.y;
  return { points: pts };
}

/** Resize a freedraw by scaling its points to the new bbox. */
export function applyFreedrawHandle(
  orig: El, handle: Handle, wx: number, wy: number, opts: HandleOpts,
): Partial<El> | null {
  const patch = applyBboxHandle(orig, handle, wx, wy, { fixedRatio: false, ...opts });
  if (!patch || !orig.points || patch.x === undefined || patch.y === undefined) return patch;
  const oldLeft = Math.min(orig.x, orig.x + orig.w), oldRight = Math.max(orig.x, orig.x + orig.w);
  const oldTop = Math.min(orig.y, orig.y + orig.h), oldBottom = Math.max(orig.y, orig.y + orig.h);
  const oldW = Math.max(1, oldRight - oldLeft), oldH = Math.max(1, oldBottom - oldTop);
  const newLeft = patch.x!, newTop = patch.y!;
  const newRight = newLeft + (patch.w || orig.w), newBottom = newTop + (patch.h || orig.h);
  const sx = (newRight - newLeft) / oldW, sy = (newBottom - newTop) / oldH;
  const pts = orig.points.map((v, i) => {
    if (i % 2 === 0) {
      const worldX = orig.x + v;
      return newLeft + (worldX - oldLeft) * sx - newLeft;
    } else {
      const worldY = orig.y + v;
      return newTop + (worldY - oldTop) * sy - newTop;
    }
  });
  return { ...patch, points: pts };
}

/** Magnetic snap targets for line/arrow endpoints: start, middle, end. */
export function lineSnapKeyPoints(el: El): number[][] {
  const pts = el.points || [];
  const out: number[][] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) out.push([el.x + pts[i], el.y + pts[i + 1]]);
  return out;
}

/** Convert a 2-point line/arrow to a 3-point one (start / middle / end). */
export function lineNormalize(el: El): El | null {
  const pts = el.points;
  if (!pts || pts.length !== 4) return null;
  const [x0, y0, x1, y1] = pts;
  return { ...el, points: [x0, y0, (x0 + x1) / 2, (y0 + y1) / 2, x1, y1] };
}
