import type { El } from "../../types";
import { Shape, applyBboxHandle, bboxBounds, bboxHandles, bboxSnapKeyPoints, rectHitTest } from "../shape";

function drawText(ctx: CanvasRenderingContext2D, el: El, hideText: boolean | string = false) {
  if (hideText) return;
  ctx.globalAlpha = el.opacity;
  ctx.fillStyle = el.stroke;
  ctx.font = `${el.fontSize || 20}px 'Segoe UI', system-ui, sans-serif`;
  ctx.textBaseline = "top";
  for (const [i, line] of (el.text || "").split("\n").entries())
    ctx.fillText(line, el.x, el.y + i * (el.fontSize || 20) * 1.3);
}

export const textShape = new Shape({
  id: "text",
  fixedRatio: false,
  render: drawText,
  bounds: bboxBounds,
  hitTest: rectHitTest,
  handles: (el) => bboxHandles(el),
  applyHandle: (orig, h, wx, wy, opts) => applyBboxHandle(orig, h, wx, wy, { fixedRatio: false, ...opts }),
  snapKeyPoints: bboxSnapKeyPoints,
  doubleClick: (el) => ({ x: el.x, y: el.y, value: el.text ?? "" }),
});
