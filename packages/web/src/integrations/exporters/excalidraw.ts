// Excalidraw (.excalidraw) exporter — best-effort round-trip for Drawboard primitives.
import type { AppState, El } from "../../types";

function fromType(t: El["type"]): string | null {
  switch (t) {
    case "rect": return "rectangle";
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

function fromStrokeType(s?: El["strokeType"]): string {
  if (s === "dashed") return "dashed";
  if (s === "dotted") return "dotted";
  return "solid";
}

function fromFillPattern(p?: El["fillPattern"]): string {
  if (p === "hatch") return "hachure";
  if (p === "crosshatch") return "cross-hatch";
  return "solid";
}

function fromHead(h?: El["headEnd"]): string | null {
  if (h === "arrow") return "arrow";
  if (h === "triangle") return "triangle";
  if (h === "dot") return "dot";
  return null;
}

interface ExportResult {
  element: unknown | null;
  file?: { id: string; dataURL: string; mimeType: string };
}

function exportElement(el: El): ExportResult {
  const type = fromType(el.type);
  if (!type) return { element: null };

  // Excalidraw images are references into a shared files map.
  if (el.type === "image" && el.image) {
    const now = Date.now();
    return {
      element: {
        id: el.id,
        type: "image",
        x: el.x,
        y: el.y,
        width: el.w,
        height: el.h,
        angle: el.angle ?? 0,
        opacity: el.opacity ?? 1,
        seed: el.seed ?? 1,
        fileIds: [el.id],
        status: "saved",
        scale: [1, 1],
        version: 2,
      },
      file: { id: el.id, dataURL: el.image, mimeType: el.image.match(/^data:([^;]+);/)?.[1] || "image/png" },
    };
  }

  const base: Record<string, unknown> = {
    id: el.id,
    type,
    x: el.x,
    y: el.y,
    width: el.w,
    height: el.h,
    angle: el.angle ?? 0,
    strokeColor: el.stroke ?? "#1b1b1f",
    backgroundColor: el.fill && el.fill !== "transparent" ? el.fill : "transparent",
    fillStyle: fromFillPattern(el.fillPattern),
    strokeWidth: el.strokeWidth ?? 2,
    strokeStyle: fromStrokeType(el.strokeType),
    roughness: el.roughness ?? 1,
    opacity: el.opacity ?? 1,
    seed: el.seed ?? 1,
    version: 2,
  };

  if (el.type === "text") {
    base.text = el.text ?? "";
    base.fontSize = el.fontSize ?? 20;
    base.height = el.h || 28;
    if (el.textAlign) base.textAlign = el.textAlign;
  }

  if ((el.type === "line" || el.type === "arrow") && el.points) {
    const pts: number[][] = [];
    for (let i = 0; i < el.points.length; i += 2) {
      pts.push([el.points[i], el.points[i + 1]]);
    }
    base.points = pts;
    if (el.type === "arrow") {
      base.startArrowhead = fromHead(el.headStart);
      base.endArrowhead = el.headEnd === undefined ? "arrow" : fromHead(el.headEnd);
    } else {
      base.startArrowhead = null;
      base.endArrowhead = null;
    }
  }

  if (el.edges === "round") {
    base.roundness = { type: "round" };
  }
  if (el.link) base.link = el.link;

  return { element: base };
}

function makeBinding(el: El, bind: { id: string; fx: number; fy: number } | undefined, validIds: Set<string>) {
  if (!bind || !validIds.has(bind.id)) return undefined;
  return { elementId: bind.id, focus: 0, gap: 4 };
}

/** Export board elements to an Excalidraw scene. */
export function exportExcalidraw(els: El[], appState?: AppState): string {
  const results = els.map(exportElement);
  const validIds = new Set(els.map((e) => e.id));
  const elements: unknown[] = [];
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    const ex = results[i].element as Record<string, unknown> | null;
    if (!ex) continue;
    if ((el.type === "arrow" || el.type === "line") && el.points) {
      const sb = makeBinding(el, el.bindStart, validIds);
      const eb = makeBinding(el, el.bindEnd, validIds);
      if (sb) ex.startBinding = sb;
      if (eb) ex.endBinding = eb;
    }
    elements.push(ex);
  }
  const files: Record<string, { mimeType: string; dataURL: string; id: string; created: number; lastRetrieved: number }> = {};
  for (const r of results) {
    if (r.file) {
      files[r.file.id] = {
        id: r.file.id,
        mimeType: r.file.mimeType,
        dataURL: r.file.dataURL,
        created: Date.now(),
        lastRetrieved: Date.now(),
      };
    }
  }
  const scene = {
    type: "excalidraw",
    version: 2,
    source: "drawboard",
    elements,
    appState: {
      viewBackgroundColor: appState?.background ?? "#ffffff",
      gridSize: appState?.grid ? 20 : null,
    },
    files,
  };
  return JSON.stringify(scene, null, 2);
}
