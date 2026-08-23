import type { El } from "../../types";
import { applyStroke, centerText, mulberry32, sketchStroke } from "../draw-utils";
import { Shape, applyBboxHandle, bboxBounds, bboxHandles, bboxSnapKeyPoints, bboxTextEditTarget, ellipseHitTest } from "../shape";

function drawEllipse(ctx: CanvasRenderingContext2D, el: El, hideText: boolean | string = false) {
  applyStroke(ctx, el);
  const rand = mulberry32(el.seed);
  const { x, y, w, h } = el;
  const cx = x + w / 2, cy = y + h / 2;
  const rx = Math.abs(w / 2), ry = Math.abs(h / 2);
  const N = 32, pts: number[][] = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  if (el.fill !== "transparent") {
    ctx.fillStyle = el.fill;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath(); ctx.fill();
  }
  sketchStroke(ctx, el, rand, pts);
  if (!hideText) centerText(ctx, el);
}

export const ellipseShape = new Shape({
  id: "ellipse",
  fixedRatio: false,
  render: drawEllipse,
  bounds: bboxBounds,
  hitTest: ellipseHitTest,
  handles: (el) => bboxHandles(el),
  applyHandle: (orig, h, wx, wy, opts) => applyBboxHandle(orig, h, wx, wy, { fixedRatio: false, ...opts }),
  snapKeyPoints: bboxSnapKeyPoints,
  doubleClick: bboxTextEditTarget,
});
