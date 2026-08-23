import { Shape, applyPolylineHandle, lineHitTest, lineLabelTarget, lineNormalize, lineSnapKeyPoints, pointsBounds, polylineHandles } from "../shape";
import { drawLineOrArrow } from "../draw-utils";

export const lineShape = new Shape({
  id: "line",
  fixedRatio: false,
  render: (ctx, el, hideText) => drawLineOrArrow(ctx, el, hideText, false),
  bounds: pointsBounds,
  hitTest: lineHitTest,
  handles: polylineHandles,
  applyHandle: applyPolylineHandle,
  snapKeyPoints: lineSnapKeyPoints,
  normalize: lineNormalize,
  doubleClick: lineLabelTarget,
});
