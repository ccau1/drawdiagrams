// Runtime registry of every `El.type` -> `Shape` instance. Both built-ins
// and plugin draws are represented by instances of the same `Shape` class;
// built-ins are imported from `canvas/shapes/` and plugin behavior is driven
// by the data on `El` (e.g. `el.svg` for icons, `el.shape` for parametrics).
import type { El } from "../types";
import { Shape } from "./shape";

import { rectShape } from "./shapes/rect";
import { ellipseShape } from "./shapes/ellipse";
import { diamondShape } from "./shapes/diamond";
import { textShape } from "./shapes/text";
import { iconShape } from "./shapes/icon";
import { imageShape } from "./shapes/image";
import { lineShape } from "./shapes/line";
import { arrowShape } from "./shapes/arrow";
import { freedrawShape } from "./shapes/freedraw";
import { parametricShape } from "./shapes/parametric";

const SHAPES = new Map<string, Shape>();

export function registerShape(shape: Shape) {
  SHAPES.set(shape.id, shape);
}

export function shapeFor(el: El): Shape {
  return SHAPES.get(el.type) ?? rectShape; // fallback keeps the app usable
}

[rectShape, ellipseShape, diamondShape, textShape, iconShape, imageShape, lineShape, arrowShape, freedrawShape, parametricShape]
  .forEach(registerShape);
