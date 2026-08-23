import type { El } from "../../types";
import { Shape, applyBboxHandle, bboxBounds, bboxHandles, bboxSnapKeyPoints, bboxTextEditTarget, rectHitTest } from "../shape";
import { iconImage } from "../draw-utils";

function drawIcon(ctx: CanvasRenderingContext2D, el: El) {
  const img = el.svg ? iconImage(el.svg, el.stroke) : null;
  ctx.globalAlpha = el.opacity;
  if (img) ctx.drawImage(img, el.x, el.y, el.w, el.h);
  else { ctx.strokeRect(el.x, el.y, el.w, el.h); }
}

export const iconShape = new Shape({
  id: "icon",
  fixedRatio: true,
  render: drawIcon,
  bounds: bboxBounds,
  hitTest: rectHitTest,
  handles: (el) => bboxHandles(el, true), // 4 corners only
  applyHandle: (orig, h, wx, wy, opts) => applyBboxHandle(orig, h, wx, wy, { fixedRatio: true, ...opts }),
  snapKeyPoints: bboxSnapKeyPoints,
  doubleClick: bboxTextEditTarget,
});
