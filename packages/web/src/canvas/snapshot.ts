// Thumbnail snapshot: renders the whole scene to a small offscreen canvas
// and returns it as a JPEG data URL. Icons whose images are still loading are
// skipped by drawElement (async icon cache), so the render stays synchronous.
import type { El } from "../types";
import { drawElement } from "./draw";
import { elBoundsPad } from "./renderer";

const PAD = 24;

export function renderThumbnail(els: El[], background: string, maxW = 480): string | null {
  if (!els.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const el of els) {
    const b = elBoundsPad(el);
    if (b.x0 < x0) x0 = b.x0;
    if (b.y0 < y0) y0 = b.y0;
    if (b.x1 > x1) x1 = b.x1;
    if (b.y1 > y1) y1 = b.y1;
  }
  const w = x1 - x0 + PAD * 2, h = y1 - y0 + PAD * 2;
  if (w <= 0 || h <= 0) return null;
  const scale = Math.min(1, maxW / w);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.translate(PAD - x0, PAD - y0);
  for (const el of els) drawElement(ctx, el, false);
  return canvas.toDataURL("image/jpeg", 0.75);
}
