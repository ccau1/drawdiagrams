import type { El } from "../../types";
import { pastedImage } from "../draw-utils";
import { Shape, applyBboxHandle, bboxBounds, bboxHandles, bboxSnapKeyPoints, rectHitTest } from "../shape";

function drawImage(ctx: CanvasRenderingContext2D, el: El) {
  if (!el.image) return;
  const img = pastedImage(el.image);
  ctx.save();
  ctx.globalAlpha = el.opacity;
  if (img) {
    ctx.drawImage(img, el.x, el.y, el.w, el.h);
  } else {
    // Placeholder while the image decodes.
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(el.x, el.y, el.w, el.h);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

export const imageShape = new Shape({
  id: "image",
  fixedRatio: true,
  render: drawImage,
  bounds: bboxBounds,
  hitTest: rectHitTest,
  handles: (el) => bboxHandles(el, true),
  applyHandle: (orig, h, wx, wy, opts) => applyBboxHandle(orig, h, wx, wy, { fixedRatio: true, ...opts }),
  snapKeyPoints: bboxSnapKeyPoints,
});
