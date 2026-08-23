// Scene: element store with a uniform-grid spatial index so rendering and
// hit-testing only touch what's on screen, no matter how big the board gets.
import type { El, Viewport } from "../types";
import { closestOnSeg, elMidpoint } from "./shape";
import { shapeFor } from "./shape-registry";

// Re-export geometry helpers that the rest of the app still imports from scene.ts.
export { elMidpoint } from "./shape";

const CELL = 512;

export function elBounds(el: El): { x0: number; y0: number; x1: number; y1: number } {
  return shapeFor(el).bounds(el);
}

const cellKey = (cx: number, cy: number) => cx + ":" + cy;

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
  // early reject on the (points-aware) bounds
  const b = elBounds(el);
  if (wx < b.x0 - tol || wx > b.x1 + tol || wy < b.y0 - tol || wy > b.y1 + tol) return false;
  return shapeFor(el).hitTest(el, wx, wy, tol);
}

export function pointInPolygon(x: number, y: number, poly: number[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; i += 2) {
    const xi = poly[i], yi = poly[i + 1];
    const xj = poly[j], yj = poly[j + 1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi || 1) + xi)) inside = !inside;
    j = i;
  }
  return inside;
}

/** Magnetic snap for line/arrow endpoints: strong snap to a shape's key
 *  points, weaker snap to anywhere on its edge. */
export function snapKeyPoints(el: El): number[][] {
  return shapeFor(el).snapKeyPoints(el);
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
    const shape = shapeFor(el);
    if (!shape.snapKeyPoints(el).length) continue; // skip line-like shapes for arrow snap targets
    const x0 = Math.min(el.x, el.x + el.w), x1 = Math.max(el.x, el.x + el.w);
    const y0 = Math.min(el.y, el.y + el.h), y1 = Math.max(el.y, el.y + el.h);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const key = snapKeyPoints(el);
    const edges: number[][] = [];
    if (shape.id === "ellipse") {
      const rx = (x1 - x0) / 2 || 1, ry = (y1 - y0) / 2 || 1;
      const a = Math.atan2((wy - cy) / ry, (wx - cx) / rx);
      const ex = cx + rx * Math.cos(a), ey = cy + ry * Math.sin(a);
      const d = Math.hypot(wx - ex, wy - ey);
      if (d <= weakTol && (!weak || d < weak.d)) weak = { x: ex, y: ey, d, id: el.id };
    } else if (shape.id === "diamond") {
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
