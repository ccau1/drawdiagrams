// Scene: element store with a uniform-grid spatial index so rendering and
// hit-testing only touch what's on screen, no matter how big the board gets.
import type { El, LineKind, Viewport } from "../types";

const CELL = 512;

export function elBounds(el: El): { x0: number; y0: number; x1: number; y1: number } {
  if ((el.type === "line" || el.type === "arrow" || el.type === "freedraw") && el.points) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < el.points.length; i += 2) {
      x0 = Math.min(x0, el.points[i]); x1 = Math.max(x1, el.points[i]);
      y0 = Math.min(y0, el.points[i + 1]); y1 = Math.max(y1, el.points[i + 1]);
    }
    const pad = el.strokeWidth * 2 + 4;
    return { x0: el.x + x0 - pad, y0: el.y + y0 - pad, x1: el.x + x1 + pad, y1: el.y + y1 + pad };
  }
  const pad = el.strokeWidth + 4;
  return {
    x0: Math.min(el.x, el.x + el.w) - pad,
    y0: Math.min(el.y, el.y + el.h) - pad,
    x1: Math.max(el.x, el.x + el.w) + pad,
    y1: Math.max(el.y, el.y + el.h) + pad,
  };
}

const cellKey = (cx: number, cy: number) => cx + ":" + cy;

/** Line/arrow routing kind, with legacy fallback to the old curve flag. */
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
    // dominant axis decides whether the first leg is horizontal or vertical
    if (Math.abs(x1 - x0) >= Math.abs(y1 - y0)) {
      return [[el.x + x0, el.y + y0], [el.x + mx, el.y + y0], [el.x + mx, el.y + y1], [el.x + x1, el.y + y1]];
    }
    return [[el.x + x0, el.y + y0], [el.x + x0, el.y + my], [el.x + x1, el.y + my], [el.x + x1, el.y + y1]];
  }
  return null;
}

/** Midpoint of a line/arrow in world coords, accounting for the routing:
 *  bezier visual midpoint for curves, bend center for elbows. */
export function elMidpoint(el: El): { x: number; y: number } {
  const pts = el.points || [0, 0, 0, 0];
  const kind = lineKind(el);
  if (kind === "curve" && pts.length === 6) {
    // quadratic bezier at t=0.5
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

export class Scene {
  private map = new Map<string, El>();
  private grid = new Map<string, Set<string>>();
  private order: string[] = [];          // z-order, back → front
  private rank = new Map<string, number>();
  version = 0;
  private dirtyCells = new Set<string>();

  all(): El[] {
    const out: El[] = [];
    for (const id of this.order) {
      const el = this.map.get(id);
      if (el) out.push(el);
    }
    return out;
  }
  get(id: string) { return this.map.get(id); }
  get size() { return this.map.size; }

  private rebuildRank() {
    this.rank.clear();
    this.order.forEach((id, i) => this.rank.set(id, i));
  }

  private cellsOf(b: { x0: number; y0: number; x1: number; y1: number }): string[] {
    const out: string[] = [];
    for (let cx = Math.floor(b.x0 / CELL); cx <= Math.floor(b.x1 / CELL); cx++)
      for (let cy = Math.floor(b.y0 / CELL); cy <= Math.floor(b.y1 / CELL); cy++)
        out.push(cellKey(cx, cy));
    return out;
  }

  private unindex(el: El) {
    for (const k of this.cellsOf(elBounds(el))) {
      this.grid.get(k)?.delete(el.id);
      this.dirtyCells.add(k);
    }
  }
  private index(el: El) {
    for (const k of this.cellsOf(elBounds(el))) {
      let s = this.grid.get(k);
      if (!s) this.grid.set(k, (s = new Set()));
      s.add(el.id);
      this.dirtyCells.add(k);
    }
  }

  upsert(el: El) {
    const old = this.map.get(el.id);
    if (old) this.unindex(old);
    if (!old) this.order.push(el.id);
    this.map.set(el.id, el);
    this.index(el);
    this.rank.set(el.id, this.order.indexOf(el.id));
    this.version++;
  }

  remove(id: string) {
    const el = this.map.get(id);
    if (!el) return;
    this.unindex(el);
    this.map.delete(id);
    const i = this.order.indexOf(id);
    if (i >= 0) this.order.splice(i, 1);
    this.rebuildRank();
    this.version++;
  }

  replaceAll(els: El[]) {
    this.map.clear(); this.grid.clear();
    this.order = els.map((e) => e.id);
    for (const el of els) { this.map.set(el.id, el); this.index(el); }
    this.rebuildRank();
    this.version++;
  }

  orderIds(): string[] { return [...this.order]; }

  /** z-index of an element (0 = back), -1 if not found. */
  rankOf(id: string): number { return this.rank.get(id) ?? -1; }

  /** Layer ops on a set of elements, preserving their relative order. */
  reorder(ids: Set<string>, op: "up" | "down" | "top" | "bottom") {
    const o = this.order;
    if (![...ids].some((id) => this.rank.has(id))) return;
    if (op === "top" || op === "bottom") {
      const sel = o.filter((id) => ids.has(id));
      const rest = o.filter((id) => !ids.has(id));
      this.order = op === "top" ? [...rest, ...sel] : [...sel, ...rest];
    } else if (op === "up") {
      for (let i = o.length - 2; i >= 0; i--)
        if (ids.has(o[i]) && !ids.has(o[i + 1])) [o[i], o[i + 1]] = [o[i + 1], o[i]];
    } else {
      for (let i = 1; i < o.length; i++)
        if (ids.has(o[i]) && !ids.has(o[i - 1])) [o[i], o[i - 1]] = [o[i - 1], o[i]];
    }
    this.rebuildRank();
    this.version++;
  }

  /** Adopt a z-order received from a peer; unknown/local-only ids keep their
   *  relative order at the end. */
  setOrder(ids: string[]) {
    const known = ids.filter((id) => this.map.has(id));
    const rest = this.order.filter((id) => !ids.includes(id));
    this.order = [...known, ...rest];
    this.rebuildRank();
    this.version++;
  }

  /** Elements intersecting the given world rect — viewport culling. */
  query(x0: number, y0: number, x1: number, y1: number): El[] {
    const out: El[] = [];
    const seen = new Set<string>();
    for (const k of this.cellsOf({ x0, y0, x1, y1 })) {
      const s = this.grid.get(k);
      if (!s) continue;
      for (const id of s) {
        if (seen.has(id)) continue;
        seen.add(id);
        const el = this.map.get(id);
        if (!el) continue;
        const b = elBounds(el);
        if (b.x1 >= x0 && b.x0 <= x1 && b.y1 >= y0 && b.y0 <= y1) out.push(el);
      }
    }
    return out;
  }

  queryViewport(vp: Viewport, cssW: number, cssH: number): El[] {
    const w = cssW / vp.zoom, h = cssH / vp.zoom;
    const out = this.query(vp.x - 40, vp.y - 40, vp.x + w + 40, vp.y + h + 40);
    out.sort((a, b) => (this.rank.get(a.id) ?? 0) - (this.rank.get(b.id) ?? 0));
    return out;
  }

  /** Topmost element containing world point (simple bbox+shape test).
   *  `tol` is the click tolerance in world units — pass ~10/zoom so
   *  selection feels the same at any zoom level. */
  hitTest(wx: number, wy: number, tol = 6): El | null {
    const cand = this.query(wx - tol, wy - tol, wx + tol, wy + tol);
    cand.sort((a, b) => (this.rank.get(b.id) ?? 0) - (this.rank.get(a.id) ?? 0)); // topmost first
    for (const el of cand) {
      if (pointInEl(el, wx, wy, tol)) return el;
    }
    return null;
  }

  sceneBounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const el of this.map.values()) {
      const b = elBounds(el);
      x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0);
      x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
    }
    if (!isFinite(x0)) return { x0: 0, y0: 0, x1: 1000, y1: 1000 };
    return { x0, y0, x1, y1 };
  }
}

function pointInEl(el: El, wx: number, wy: number, tol = 6): boolean {
  const pad = Math.max(tol, el.strokeWidth * 2);
  // early reject on the (points-aware) bounds
  const b = elBounds(el);
  if (wx < b.x0 - pad || wx > b.x1 + pad || wy < b.y0 - pad || wy > b.y1 + pad) return false;
  // tight bbox (small 2px grace) so clicking just outside a shape deselects
  const x0 = Math.min(el.x, el.x + el.w) - 2, x1 = Math.max(el.x, el.x + el.w) + 2;
  const y0 = Math.min(el.y, el.y + el.h) - 2, y1 = Math.max(el.y, el.y + el.h) + 2;
  switch (el.type) {
    case "rect": case "shape": case "icon": case "text":
      return wx >= x0 && wx <= x1 && wy >= y0 && wy <= y1;
    case "diamond": {
      const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
      const dx = Math.abs(wx - cx) / (Math.abs(el.w) / 2 + 2);
      const dy = Math.abs(wy - cy) / (Math.abs(el.h) / 2 + 2);
      return dx + dy <= 1.1;
    }
    case "ellipse": {
      const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
      const rx = Math.abs(el.w) / 2 || 1, ry = Math.abs(el.h) / 2 || 1;
      const v = ((wx - cx) ** 2) / ((rx + pad) ** 2) + ((wy - cy) ** 2) / ((ry + pad) ** 2);
      if (el.fill !== "transparent") return v <= 1.15;
      return v <= 1.15 && v >= (rx * ry) / ((rx + pad) * (ry + pad)) * 0.7;
    }
    case "line": case "arrow": case "freedraw": {
      if (!el.points) return false;
      const t = pad + 4;
      const path = linePath(el);
      if (path) {
        for (let i = 0; i + 1 < path.length; i++) {
          if (distToSeg(wx, wy, path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]) < t)
            return true;
        }
        return false;
      }
      for (let i = 0; i + 3 < el.points.length; i += 2) {
        if (distToSeg(wx, wy, el.x + el.points[i], el.y + el.points[i + 1],
          el.x + el.points[i + 2], el.y + el.points[i + 3]) < t) return true;
      }
      return el.points.length === 2 &&
        Math.hypot(wx - (el.x + el.points[0]), wy - (el.y + el.points[1])) < t;
    }
  }
  return false;
}

function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function closestOnSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const x = x1 + t * dx, y = y1 + t * dy;
  return { x, y, d: Math.hypot(px - x, py - y) };
}

/** Magnetic snap for line/arrow endpoints: strong snap to a shape's key
 *  points (cardinal points / corners), weaker snap to anywhere on its edge. */
/** The strong (magnetic) snap points of a shape, in world coords. */
export function snapKeyPoints(el: El): number[][] {
  const x0 = Math.min(el.x, el.x + el.w), x1 = Math.max(el.x, el.x + el.w);
  const y0 = Math.min(el.y, el.y + el.h), y1 = Math.max(el.y, el.y + el.h);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  if (el.type === "ellipse" || el.type === "diamond")
    return [[cx, y0], [x1, cy], [cx, y1], [x0, cy]];
  if (el.type === "rect" || el.type === "icon" || el.type === "shape")
    return [[x0, y0], [cx, y0], [x1, y0], [x1, cy], [x1, y1], [cx, y1], [x0, y1], [x0, cy]];
  return [];
}

export function snapPoint(
  scene: Scene, wx: number, wy: number, excludeId: string,
  strongTol: number, weakTol: number,
): { x: number; y: number; id: string } | null {
  let strong: { x: number; y: number; d: number; id: string } | null = null;
  let weak: { x: number; y: number; d: number; id: string } | null = null;
  const cand = scene.query(wx - strongTol, wy - strongTol, wx + strongTol, wy + strongTol);
  for (const el of cand) {
    if (el.id === excludeId) continue;
    if (!["rect", "ellipse", "diamond", "icon", "shape"].includes(el.type)) continue;
    const x0 = Math.min(el.x, el.x + el.w), x1 = Math.max(el.x, el.x + el.w);
    const y0 = Math.min(el.y, el.y + el.h), y1 = Math.max(el.y, el.y + el.h);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const key = snapKeyPoints(el); // strong points
    const edges: number[][] = [];  // [x1,y1,x2,y2] segments for the weak snap
    if (el.type === "ellipse") {
      // nearest point on the circumference (angle approximation)
      const rx = (x1 - x0) / 2 || 1, ry = (y1 - y0) / 2 || 1;
      const a = Math.atan2((wy - cy) / ry, (wx - cx) / rx);
      const ex = cx + rx * Math.cos(a), ey = cy + ry * Math.sin(a);
      const d = Math.hypot(wx - ex, wy - ey);
      if (d <= weakTol && (!weak || d < weak.d)) weak = { x: ex, y: ey, d, id: el.id };
    } else if (el.type === "diamond") {
      for (let i = 0; i < 4; i++) {
        const [ax, ay] = key[i], [bx, by] = key[(i + 1) % 4];
        edges.push([ax, ay, bx, by]);
      }
    } else {
      edges.push([x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]);
    }
    for (const [px, py] of key) {
      const d = Math.hypot(wx - px, wy - py);
      if (d <= strongTol && (!strong || d < strong.d)) strong = { x: px, y: py, d, id: el.id };
    }
    for (const [ax, ay, bx, by] of edges) {
      const c = closestOnSeg(wx, wy, ax, ay, bx, by);
      if (c.d <= weakTol && (!weak || c.d < weak.d)) weak = { ...c, id: el.id };
    }
  }
  return strong || weak;
}
