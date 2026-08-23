// Excalidraw (.excalidraw / .json) importer.
// Supports the subset of Excalidraw elements that map to Drawboard primitives.
import type { AppState, El, ImportResult } from "../../types";
import { uid } from "../../types";

interface ExBinding {
  elementId: string;
  focus?: number;
  gap?: number;
}

interface ExFile {
  mimeType?: string;
  dataURL?: string;
}

interface ExEl {
  id?: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  roughness?: number;
  opacity?: number;
  seed?: number;
  text?: string;
  fontSize?: number;
  textAlign?: "left" | "center" | "right";
  link?: string;
  points?: number[][];
  startArrowhead?: string | null;
  endArrowhead?: string | null;
  roundness?: { type: string } | null;
  fileIds?: string[];
  startBinding?: ExBinding | null;
  endBinding?: ExBinding | null;
}

interface ExAppState {
  viewBackgroundColor?: string;
  gridSize?: number | null;
}

interface ExScene {
  type?: string;
  elements?: ExEl[];
  appState?: ExAppState;
  files?: Record<string, ExFile>;
}

function toType(t: string): El["type"] | null {
  switch (t) {
    case "rectangle": return "rect";
    case "ellipse": return "ellipse";
    case "diamond": return "diamond";
    case "arrow": return "arrow";
    case "line": return "line";
    case "freedraw": return "freedraw";
    case "text": return "text";
    case "image": return "image";
    default: return null;
  }
}

function toStrokeStyle(s?: string): El["strokeType"] {
  if (s === "dashed") return "dashed";
  if (s === "dotted") return "dotted";
  return "solid";
}

function toFillPattern(s?: string): El["fillPattern"] {
  if (s === "hachure") return "hatch";
  if (s === "cross-hatch") return "crosshatch";
  return "solid";
}

function toHead(h?: string | null): El["headEnd"] {
  if (h === "arrow") return "arrow";
  if (h === "triangle") return "triangle";
  if (h === "dot") return "dot";
  return "none";
}

function normalize(el: ExEl): Partial<El> {
  const base: Partial<El> = {
    x: el.x,
    y: el.y,
    w: el.width ?? 120,
    h: el.height ?? 60,
    angle: el.angle ?? 0,
    stroke: el.strokeColor ?? "#1b1b1f",
    fill: el.backgroundColor && el.backgroundColor !== "transparent" ? el.backgroundColor : "transparent",
    strokeWidth: el.strokeWidth ?? 2,
    opacity: el.opacity ?? 1,
    strokeType: toStrokeStyle(el.strokeStyle),
    fillPattern: toFillPattern(el.fillStyle),
    roughness: el.roughness ?? 1,
    seed: el.seed ?? Math.floor(Math.random() * 2 ** 31),
  };
  if (el.text !== undefined) {
    base.text = el.text;
    base.fontSize = el.fontSize ?? 20;
    if (el.textAlign) base.textAlign = el.textAlign;
  }
  if (el.link) base.link = el.link;
  if (el.points && el.points.length >= 2) {
    base.points = el.points.flat();
  }
  if (el.type === "arrow") {
    base.headStart = toHead(el.startArrowhead);
    base.headEnd = el.endArrowhead === undefined ? "arrow" : toHead(el.endArrowhead);
  }
  if (el.roundness?.type === "round") {
    base.edges = "round";
  }
  return base;
}

function bindingFrac(end: { x: number; y: number }, shape: El): { fx: number; fy: number } {
  const x0 = Math.min(shape.x, shape.x + shape.w), x1 = Math.max(shape.x, shape.x + shape.w);
  const y0 = Math.min(shape.y, shape.y + shape.h), y1 = Math.max(shape.y, shape.y + shape.h);
  return { fx: (end.x - x0) / (x1 - x0 || 1), fy: (end.y - y0) / (y1 - y0 || 1) };
}

/** Parse Excalidraw JSON into board elements. */
export function importExcalidraw(text: string): ImportResult {
  let scene: ExScene;
  try {
    scene = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON file");
  }
  if (!scene || typeof scene !== "object") throw new Error("Invalid Excalidraw file");
  const elements = Array.isArray(scene.elements) ? scene.elements : [];
  const files = scene.files || {};

  const out: El[] = [];
  const idMap = new Map<string, string>(); // Excalidraw id -> Drawboard id
  const byId = new Map<string, El>();      // Drawboard id -> element

  // First pass: create all elements.
  for (const el of elements) {
    const type = toType(el.type);
    if (!type) continue;
    const normalized = normalize(el);
    if (type === "text") {
      normalized.fill = "transparent";
      normalized.w = el.width ?? 200;
      normalized.h = el.height ?? 28;
    }
    if (type === "image") {
      normalized.fill = "transparent";
      const fileId = el.fileIds?.[0];
      const file = fileId ? files[fileId] : undefined;
      if (file?.dataURL) normalized.image = file.dataURL;
    }
    const dbEl: El = {
      id: uid(),
      type,
      x: normalized.x ?? 0,
      y: normalized.y ?? 0,
      w: normalized.w ?? 100,
      h: normalized.h ?? 60,
      angle: normalized.angle ?? 0,
      stroke: normalized.stroke ?? "#1b1b1f",
      fill: normalized.fill ?? "transparent",
      strokeWidth: normalized.strokeWidth ?? 2,
      opacity: normalized.opacity ?? 1,
      dashed: normalized.strokeType === "dashed",
      strokeType: normalized.strokeType,
      roughness: normalized.roughness ?? 1,
      seed: normalized.seed ?? Math.floor(Math.random() * 2 ** 31),
      updatedAt: Date.now(),
      ...normalized,
    } as El;
    out.push(dbEl);
    byId.set(dbEl.id, dbEl);
    if (el.id) idMap.set(el.id, dbEl.id);
  }

  // Second pass: restore arrow bindings using the imported element positions.
  for (let i = 0; i < elements.length; i++) {
    const ex = elements[i];
    const dbEl = out[i];
    if (!dbEl || (dbEl.type !== "arrow" && dbEl.type !== "line") || !dbEl.points) continue;
    const pts = dbEl.points;
    const start = { x: dbEl.x + pts[0], y: dbEl.y + pts[1] };
    const end = { x: dbEl.x + pts[pts.length - 2], y: dbEl.y + pts[pts.length - 1] };
    if (ex.startBinding?.elementId) {
      const shapeId = idMap.get(ex.startBinding.elementId);
      const shape = shapeId ? byId.get(shapeId) : undefined;
      if (shape) dbEl.bindStart = { id: shape.id, ...bindingFrac(start, shape) };
    }
    if (ex.endBinding?.elementId) {
      const shapeId = idMap.get(ex.endBinding.elementId);
      const shape = shapeId ? byId.get(shapeId) : undefined;
      if (shape) dbEl.bindEnd = { id: shape.id, ...bindingFrac(end, shape) };
    }
  }

  // Normalize so the imported diagram starts near the origin.
  if (out.length) {
    const minX = Math.min(...out.map((e) => e.x));
    const minY = Math.min(...out.map((e) => e.y));
    for (const e of out) { e.x -= minX - 60; e.y -= minY - 60; }
  }
  const appState: AppState = {};
  const exApp = scene.appState;
  if (exApp?.viewBackgroundColor && exApp.viewBackgroundColor !== "#ffffff") {
    appState.background = exApp.viewBackgroundColor;
  }
  if (typeof exApp?.gridSize === "number") {
    appState.grid = exApp.gridSize > 0;
  }
  return { elements: out, appState: Object.keys(appState).length ? appState : undefined };
}
