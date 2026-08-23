// Renderer: DPR-aware canvas with viewport culling and a dot grid. Renders
// on demand (rAF-coalesced) — zero work when nothing changes.
import type { CanvasTheme, El, Viewport } from "../types";
import { drawElement } from "./draw";
import { shapeFor } from "./shape-registry";
import type { Scene } from "./scene";

export interface Cursor { id: string; name: string; x: number; y: number; color: string; }

export class Renderer {
  ctx: CanvasRenderingContext2D;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  private raf = 0;
  private needsRender = true;
  showGrid = true;

  constructor(
    public canvas: HTMLCanvasElement,
    public scene: Scene,
    public vp: Viewport,
    public theme: CanvasTheme,
    public extras: () => {
      selection: Set<string>;
      draft: El | null;
      cursors: Cursor[];
      editing: { id: string | null; field?: string };
      snapHints: { x: number; y: number }[];
      selRegion: { type: "rect"; x0: number; y0: number; x1: number; y1: number } | { type: "lasso"; points: number[] } | null;
    },
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
    if (this.showGrid && step >= 8) {
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
    const { selection, draft, cursors, editing, snapHints, selRegion } = this.extras();
    const hideText = (el: El) => el.id === editing.id ? editing.field ?? true : false;
    for (const el of visible) drawElement(ctx, el, hideText(el));

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

    // selection boxes + per-shape handles
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
        if (selection.size === 1) {
          const hs = shapeFor(el).handles(el);
          for (const h of hs) {
            if (h.role === "vertex") {
              ctx.beginPath();
              ctx.arc(h.x, h.y, 5 / vp.zoom, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            } else {
              const s = 4 / vp.zoom;
              ctx.fillRect(h.x - s, h.y - s, s * 2, s * 2);
              ctx.strokeRect(h.x - s, h.y - s, s * 2, s * 2);
            }
          }
        }
        ctx.setLineDash([5 / vp.zoom, 4 / vp.zoom]);
      }
      ctx.setLineDash([]);
    }

    // live selection region while dragging on empty space
    if (selRegion) {
      ctx.strokeStyle = this.theme.selectionBox;
      ctx.lineWidth = 1 / vp.zoom;
      ctx.setLineDash([5 / vp.zoom, 4 / vp.zoom]);
      if (selRegion.type === "rect") {
        ctx.strokeRect(selRegion.x0, selRegion.y0, selRegion.x1 - selRegion.x0, selRegion.y1 - selRegion.y0);
      } else if (selRegion.points.length > 2) {
        ctx.beginPath();
        ctx.moveTo(selRegion.points[0], selRegion.points[1]);
        for (let i = 2; i + 1 < selRegion.points.length; i += 2) {
          ctx.lineTo(selRegion.points[i], selRegion.points[i + 1]);
        }
        ctx.closePath();
        ctx.stroke();
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
  const b = shapeFor(el).bounds(el);
  const pad = 4;
  return { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad };
}

export const CURSOR_COLORS = ["#e0533d", "#2f9e44", "#1971c2", "#9c36b5", "#f08c00", "#0c8599", "#c2255c"];
export const colorFor = (id: string) => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return CURSOR_COLORS[Math.abs(h) % CURSOR_COLORS.length];
};
