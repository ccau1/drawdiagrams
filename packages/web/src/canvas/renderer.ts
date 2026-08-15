// Renderer: DPR-aware canvas with viewport culling and a dot grid. Renders
// on demand (rAF-coalesced) — zero work when nothing changes.
import type { CanvasTheme, El, Viewport } from "../types";
import { drawElement } from "./draw";
import type { Scene } from "./scene";

export interface Cursor { id: string; name: string; x: number; y: number; color: string; }

export class Renderer {
  ctx: CanvasRenderingContext2D;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  private raf = 0;
  private needsRender = true;

  constructor(
    public canvas: HTMLCanvasElement,
    public scene: Scene,
    public vp: Viewport,
    public theme: CanvasTheme,
    public extras: () => { selection: Set<string>; draft: El | null; cursors: Cursor[]; editingId: string | null; snapHints: { x: number; y: number }[] },
  ) {
    this.ctx = canvas.getContext("2d")!;
  }

  invalidate() {
    if (this.raf) { this.needsRender = true; return; }
    this.raf = requestAnimationFrame(() => {
      this.raf = 0; this.needsRender = false; this.render();
    });
  }

  resize(cssW: number, cssH: number) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.canvas.style.width = cssW + "px";
    this.canvas.style.height = cssH + "px";
    this.invalidate();
  }

  toWorld(cx: number, cy: number) {
    return { x: this.vp.x + cx / this.vp.zoom, y: this.vp.y + cy / this.vp.zoom };
  }

  render() {
    const { ctx, vp } = this;
    const w = this.canvas.width / this.dpr, h = this.canvas.height / this.dpr;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = this.theme.background;
    ctx.fillRect(0, 0, w, h);

    // dot grid (skip when dots would be < 4px apart)
    const step = 24 * vp.zoom;
    if (step >= 8) {
      ctx.fillStyle = this.theme.gridColor;
      const ox = ((-vp.x * vp.zoom) % step + step) % step;
      const oy = ((-vp.y * vp.zoom) % step + step) % step;
      for (let gx = ox; gx < w; gx += step)
        for (let gy = oy; gy < h; gy += step)
          ctx.fillRect(gx, gy, 1.5, 1.5);
    }

    ctx.save();
    ctx.scale(vp.zoom, vp.zoom);
    ctx.translate(-vp.x, -vp.y);
    ctx.lineWidth = 1;

    const visible = this.scene.queryViewport(vp, w, h);
    const { selection, draft, cursors, editingId, snapHints } = this.extras();
    for (const el of visible) drawElement(ctx, el, el.id === editingId);

    if (draft) drawElement(ctx, draft);

    // snap target hints while dragging an arrow endpoint near a shape
    if (snapHints.length) {
      ctx.fillStyle = this.theme.selectionBox;
      for (const h of snapHints) {
        ctx.beginPath();
        ctx.arc(h.x, h.y, 4 / vp.zoom, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // selection boxes
    if (selection.size) {
      ctx.strokeStyle = this.theme.selectionBox;
      ctx.lineWidth = 1.5 / vp.zoom;
      ctx.setLineDash([5 / vp.zoom, 4 / vp.zoom]);
      for (const id of selection) {
        const el = this.scene.get(id);
        if (!el) continue;
        const b = elBoundsPad(el);
        ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
        ctx.setLineDash([]);
        ctx.fillStyle = "#ffffff";
        if (selection.size === 1 && (el.type === "line" || el.type === "arrow") && el.points) {
          // vertex handles: start / middle / end (draggable)
          for (let i = 0; i + 1 < el.points.length; i += 2) {
            ctx.beginPath();
            ctx.arc(el.x + el.points[i], el.y + el.points[i + 1], 5 / vp.zoom, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        } else if (selection.size === 1) {
          for (const [hx, hy] of handles(b)) {
            ctx.fillRect(hx - 4 / vp.zoom, hy - 4 / vp.zoom, 8 / vp.zoom, 8 / vp.zoom);
            ctx.strokeRect(hx - 4 / vp.zoom, hy - 4 / vp.zoom, 8 / vp.zoom, 8 / vp.zoom);
          }
        }
        ctx.setLineDash([5 / vp.zoom, 4 / vp.zoom]);
      }
      ctx.setLineDash([]);
    }
    ctx.restore();

    // remote cursors (screen space)
    for (const c of cursors) {
      const sx = (c.x - vp.x) * vp.zoom, sy = (c.y - vp.y) * vp.zoom;
      if (sx < -50 || sy < -50 || sx > w + 50 || sy > h + 50) continue;
      ctx.fillStyle = c.color;
      ctx.beginPath();
      ctx.moveTo(sx, sy); ctx.lineTo(sx + 12, sy + 16); ctx.lineTo(sx + 5, sy + 17); ctx.closePath();
      ctx.fill();
      ctx.font = "11px system-ui";
      ctx.fillText(c.name, sx + 14, sy + 16);
    }
  }
}

export function elBoundsPad(el: El) {
  const pad = 4 + el.strokeWidth;
  if ((el.type === "line" || el.type === "arrow" || el.type === "freedraw") && el.points?.length) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i + 1 < el.points.length; i += 2) {
      x0 = Math.min(x0, el.x + el.points[i]); x1 = Math.max(x1, el.x + el.points[i]);
      y0 = Math.min(y0, el.y + el.points[i + 1]); y1 = Math.max(y1, el.y + el.points[i + 1]);
    }
    return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
  }
  return {
    x0: Math.min(el.x, el.x + el.w) - pad, y0: Math.min(el.y, el.y + el.h) - pad,
    x1: Math.max(el.x, el.x + el.w) + pad, y1: Math.max(el.y, el.y + el.h) + pad,
  };
}

export function handles(b: { x0: number; y0: number; x1: number; y1: number }) {
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  return [
    [b.x0, b.y0], [cx, b.y0], [b.x1, b.y0],
    [b.x1, cy], [b.x1, b.y1], [cx, b.y1],
    [b.x0, b.y1], [b.x0, cy],
  ] as [number, number][];
}

export const CURSOR_COLORS = ["#e0533d", "#2f9e44", "#1971c2", "#9c36b5", "#f08c00", "#0c8599", "#c2255c"];
export const colorFor = (id: string) => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return CURSOR_COLORS[Math.abs(h) % CURSOR_COLORS.length];
};
