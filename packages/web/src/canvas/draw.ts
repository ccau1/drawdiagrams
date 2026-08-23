// Element renderer dispatcher. Every shape-specific routine is owned by the
// active `Shape` instance in `shape-registry.ts`; this file just delegates.
import type { El } from "../types";
import { shapeFor } from "./shape-registry";

export function drawElement(ctx: CanvasRenderingContext2D, el: El, hideText: boolean | string = false) {
  ctx.save();
  shapeFor(el).render(ctx, el, hideText);
  ctx.restore();
}
