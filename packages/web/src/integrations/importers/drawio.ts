// draw.io (.drawio / .xml) importer — contributed by the uml-shapes
// integration's web side. Parses mxfile/mxGraphModel XML into elements.
import type { AppState, El, ImportResult } from "../../types";
import { uid } from "../../types";

const STYLE_COLORS: Record<string, string> = {
  fillColor: "fill", strokeColor: "stroke", fontColor: "font",
};

function parseStyle(style: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (style || "").split(";")) {
    const [k, v] = part.split("=");
    if (v !== undefined) out[k] = v;
    else if (k) out[k] = "1";
  }
  return out;
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ").trim();
  } catch { return s.replace(/<[^>]+>/g, " ").trim(); }
}

/** Parse draw.io XML text into board elements and optional appState. */
export function importDrawio(xmlText: string): ImportResult {
  const doc = new DOMParser().parseFromString(xmlText, "text/xml");
  if (doc.querySelector("parsererror")) throw new Error("Invalid XML file");
  const root = doc.querySelector("mxGraphModel root") || doc.querySelector("root");
  const graph = doc.querySelector("mxGraphModel");
  if (!root) throw new Error("No mxGraphModel found — is this a draw.io file?");

  const appState: AppState = {};
  if (graph) {
    const bg = graph.getAttribute("background");
    if (bg && bg !== "none") appState.background = bg;
    const grid = graph.getAttribute("grid");
    if (grid) appState.grid = grid === "1";
  }

  const els: El[] = [];
  const cellPos = new Map<string, { x: number; y: number; w: number; h: number }>();
  const cellElIds = new Map<string, string>();

  for (const cell of root.querySelectorAll("mxCell")) {
    const style = parseStyle(cell.getAttribute("style") || "");
    const geo = cell.querySelector("mxGeometry");
    const value = decode(cell.getAttribute("value") || "");
    const mk = (partial: Partial<El>): El => ({
      id: uid(), type: "rect", x: 0, y: 0, w: 100, h: 60, angle: 0,
      stroke: style.strokeColor || "#1b1b1f",
      fill: style.fillColor && style.fillColor !== "none" ? style.fillColor : "transparent",
      strokeWidth: 2, opacity: 1, dashed: style.dashed === "1",
      roughness: 0, seed: Math.floor(Math.random() * 2 ** 31),
      updatedAt: Date.now(), ...partial,
    });

    if (cell.getAttribute("vertex") === "1" && geo) {
      const x = +geo.getAttribute("x")! || 0, y = +geo.getAttribute("y")! || 0;
      const w = +geo.getAttribute("width")! || 120, h = +geo.getAttribute("height")! || 60;
      const cellId = cell.getAttribute("id") || "";
      cellPos.set(cellId, { x, y, w, h });

      let type: El["type"] = "rect";
      let shape: string | undefined;
      let image: string | undefined;
      const sName = style.shape || "";
      if (style.ellipse === "1" || sName === "ellipse") type = "ellipse";
      if (sName === "rhombus" || style.rhombus === "1") type = "diamond";
      if (sName === "umlActor") { type = "shape"; shape = "uml-actor"; }
      if (sName === "umlFrame" || sName === "umlBoundary") { type = "shape"; shape = "uml-frame"; }
      if (sName === "note") { type = "shape"; shape = "uml-note"; }
      if (sName === "folder" || sName === "package") { type = "shape"; shape = "uml-package"; }
      if (sName === "component") { type = "shape"; shape = "uml-component"; }
      if (sName === "image" || style.image) { type = "image"; image = style.image; }
      if (style.html === "1" && sName === "" && style.text === "1") {
        type = "text";
      }
      const textAlign = style.align === "left" ? "left" : style.align === "right" ? "right" : "center";
      const link = cell.getAttribute("link") || undefined;
      const el = mk({
        type, x, y, w, h, shape, image,
        text: value || undefined,
        fontSize: parseInt(style.fontSize || "14", 10),
        textAlign,
        link,
        fill: type === "text" || type === "image" ? "transparent" : mk({}).fill,
      });
      els.push(el);
      cellElIds.set(cellId, el.id);
    } else if (cell.getAttribute("edge") === "1" && geo) {
      const sourceId = cell.getAttribute("source") || "";
      const targetId = cell.getAttribute("target") || "";
      const src = cellPos.get(sourceId);
      const tgt = cellPos.get(targetId);
      const pts: number[] = [];
      const sp = geo.querySelector('mxPoint[as="sourcePoint"]');
      const tp = geo.querySelector('mxPoint[as="targetPoint"]');
      const wp = [...geo.querySelectorAll('Array mxPoint, mxGeometry > Array > mxPoint')];
      const start = sp ? { x: +sp.getAttribute("x")!, y: +sp.getAttribute("y")! }
        : src ? { x: src.x + src.w / 2, y: src.y + src.h / 2 } : { x: 0, y: 0 };
      const end = tp ? { x: +tp.getAttribute("x")!, y: +tp.getAttribute("y")! }
        : tgt ? { x: tgt.x + tgt.w / 2, y: tgt.y + tgt.h / 2 } : { x: start.x + 100, y: start.y };
      let minX = Math.min(start.x, end.x), minY = Math.min(start.y, end.y);
      for (const p of wp) {
        minX = Math.min(minX, +p.getAttribute("x")!); minY = Math.min(minY, +p.getAttribute("y")!);
      }
      pts.push(start.x - minX, start.y - minY);
      for (const p of wp) pts.push(+p.getAttribute("x")! - minX, +p.getAttribute("y")! - minY);
      pts.push(end.x - minX, end.y - minY);
      const isArrow = style.endArrow !== "none";
      const textAlign = style.align === "left" ? "left" : style.align === "right" ? "right" : "center";
      const link = cell.getAttribute("link") || undefined;
      const extra: Partial<El> = {
        type: isArrow ? "arrow" : "line",
        x: minX, y: minY, w: 0, h: 0, points: pts,
        fill: "transparent",
        text: value || undefined,
        textAlign,
        link,
      };
      if (src) {
        const fx = (start.x - src.x) / (src.w || 1);
        const fy = (start.y - src.y) / (src.h || 1);
        extra.bindStart = { id: cellElIds.get(sourceId) || sourceId, fx, fy };
      }
      if (tgt) {
        const fx = (end.x - tgt.x) / (tgt.w || 1);
        const fy = (end.y - tgt.y) / (tgt.h || 1);
        extra.bindEnd = { id: cellElIds.get(targetId) || targetId, fx, fy };
      }
      els.push(mk(extra));
    }
  }

  // Normalize so the imported diagram starts near the origin-ish.
  if (els.length) {
    const minX = Math.min(...els.map((e) => e.x));
    const minY = Math.min(...els.map((e) => e.y));
    for (const e of els) { e.x -= minX - 60; e.y -= minY - 60; }
  }
  return { elements: els, appState: Object.keys(appState).length ? appState : undefined };
}
