import { Shape, applyPolylineHandle, lineHitTest, lineLabelTarget, lineNormalize, lineSnapKeyPoints, pointsBounds, polylineHandles } from "../shape";
import { drawLineOrArrow } from "../draw-utils";

export const arrowShape = new Shape({
  id: "arrow",
  fixedRatio: false,
  render: (ctx, el, hideText) => drawLineOrArrow(ctx, el, hideText, true),
  bounds: pointsBounds,
  hitTest: lineHitTest,
  handles: polylineHandles,
  applyHandle: applyPolylineHandle,
  snapKeyPoints: lineSnapKeyPoints,
  normalize: lineNormalize,
  doubleClick: lineLabelTarget,
});
