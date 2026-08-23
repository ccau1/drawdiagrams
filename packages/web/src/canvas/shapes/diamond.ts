import type { El } from "../../types";
import { applyStroke, centerText, mulberry32, roundedPoly, sketchStroke } from "../draw-utils";
import { Shape, applyBboxHandle, bboxBounds, bboxHandles, bboxSnapKeyPoints, bboxTextEditTarget, diamondHitTest } from "../shape";

function drawDiamond(ctx: CanvasRenderingContext2D, el: El, hideText: boolean | string = false) {
  applyStroke(ctx, el);
  const rand = mulberry32(el.seed);
  const { x, y, w, h } = el;
  const cx = x + w / 2, cy = y + h / 2;
  const base = [[cx, y], [x + w, cy], [cx, y + h], [x, cy]];
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

export const diamondShape = new Shape({
  id: "diamond",
  fixedRatio: false,
  render: drawDiamond,
  bounds: bboxBounds,
  hitTest: diamondHitTest,
  handles: (el) => bboxHandles(el),
  applyHandle: (orig, h, wx, wy, opts) => applyBboxHandle(orig, h, wx, wy, { fixedRatio: false, ...opts }),
  snapKeyPoints: bboxSnapKeyPoints,
  doubleClick: bboxTextEditTarget,
});
