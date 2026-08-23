import type { El } from "../../types";
import { applyStroke, centerText, mulberry32, roundedPoly, sketchStroke } from "../draw-utils";
import { Shape, applyBboxHandle, bboxBounds, bboxHandles, bboxSnapKeyPoints, bboxTextEditTarget, rectHitTest } from "../shape";

function drawRect(ctx: CanvasRenderingContext2D, el: El, hideText: boolean | string = false) {
  applyStroke(ctx, el);
  const rand = mulberry32(el.seed);
  const { x, y, w, h } = el;
  const base = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const round = el.edges === "round";
  const path = round
    ? roundedPoly(base, Math.min(16, Math.abs(w) / 4, Math.abs(h) / 4))
    : [...base, base[0]];
  if (el.fill !== "transparent") {
    ctx.fillStyle = el.fill;
    ctx.beginPath();
    ctx.moveTo(path[0][0], path[0][1]);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
    ctx.closePath(); ctx.fill();
  }
  sketchStroke(ctx, el, rand, path);
  if (!hideText) centerText(ctx, el);
}

export const rectShape = new Shape({
  id: "rect",
  fixedRatio: false,
  render: drawRect,
  bounds: bboxBounds,
  hitTest: rectHitTest,
  handles: (el) => bboxHandles(el),
  applyHandle: (orig, h, wx, wy, opts) => applyBboxHandle(orig, h, wx, wy, { fixedRatio: false, ...opts }),
  snapKeyPoints: bboxSnapKeyPoints,
  doubleClick: bboxTextEditTarget,
});
