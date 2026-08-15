// Minimap: scaled overview of the whole scene with a viewport rectangle;
// click or drag to jump the camera.
import { useEffect, useRef } from "react";
import type { Scene } from "../canvas/scene";
import { drawElement } from "../canvas/draw";
import type { CanvasTheme, Viewport } from "../types";

export default function Minimap({ scene, vp, theme, cssW, cssH, onJump }: {
  scene: Scene; vp: Viewport; theme: CanvasTheme;
  cssW: number; cssH: number;
  onJump: (wx: number, wy: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = 200, H = 140;
  const drag = useRef(false);

  const mapping = () => {
    const b = scene.sceneBounds();
    const pad = 100;
    const sw = b.x1 - b.x0 + pad * 2, sh = b.y1 - b.y0 + pad * 2;
    const s = Math.min(W / sw, H / sh);
    return { b, s, ox: (W - sw * s) / 2, oy: (H - sh * s) / 2 };
  };

  const paint = () => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, W, H);
    const { b, s, ox, oy } = mapping();
    ctx.save();
    ctx.translate(ox - (b.x0 - 100) * s, oy - (b.y0 - 100) * s);
    ctx.scale(s, s);
    for (const el of scene.all()) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      drawElement(ctx, { ...el, roughness: 0, strokeWidth: Math.max(el.strokeWidth, 1.5 / s) });
      ctx.restore();
    }
    ctx.restore();
    // viewport rect
    const vx = ox + (vp.x - b.x0 + 100) * s, vy = oy + (vp.y - b.y0 + 100) * s;
    ctx.strokeStyle = theme.selectionBox;
    ctx.lineWidth = 1.5;
    ctx.fillStyle = theme.selectionBox + "22";
    ctx.fillRect(vx, vy, (cssW / vp.zoom) * s, (cssH / vp.zoom) * s);
    ctx.strokeRect(vx, vy, (cssW / vp.zoom) * s, (cssH / vp.zoom) * s);
  };

  useEffect(() => { paint(); });

  const jump = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const { b, s, ox, oy } = mapping();
    onJump(b.x0 - 100 + (px - ox) / s, b.y0 - 100 + (py - oy) / s);
  };

  return (
    <canvas
      ref={ref}
      className="minimap"
      width={W} height={H}
      onPointerDown={(e) => { drag.current = true; (e.target as Element).setPointerCapture(e.pointerId); jump(e); }}
      onPointerMove={(e) => drag.current && jump(e)}
      onPointerUp={() => (drag.current = false)}
    />
  );
}
