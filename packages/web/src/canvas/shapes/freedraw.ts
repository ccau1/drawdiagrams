import type { El } from "../../types";
import { Shape, applyFreedrawHandle, bboxHandles, lineHitTest, pointsBounds } from "../shape";
import { applyStroke } from "../draw-utils";

function drawFreedraw(ctx: CanvasRenderingContext2D, el: El) {
  applyStroke(ctx, el);
  const pts = el.points || [0, 0];
  ctx.beginPath();
  ctx.moveTo(el.x + (pts[0] || 0), el.y + (pts[1] || 0));
  for (let i = 2; i + 1 < pts.length; i += 2)
    ctx.lineTo(el.x + pts[i], el.y + pts[i + 1]);
  ctx.stroke();
}

export const freedrawShape = new Shape({
  id: "freedraw",
  fixedRatio: false,
  render: drawFreedraw,
  bounds: pointsBounds,
  hitTest: lineHitTest,
  handles: (el) => bboxHandles(el),
  applyHandle: applyFreedrawHandle,
  snapKeyPoints: () => [],
});
