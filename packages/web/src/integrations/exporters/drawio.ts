// draw.io XML exporter — best-effort round-trip for the subset the importer supports.
import type { AppState, El } from "../../types";

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function encodeValue(s: string): string {
  return escapeXml(s).replace(/\n/g, "&#xa;");
}

function shapeStyle(el: El): string {
  const parts: string[] = [];
  if (el.shape === "uml-actor") parts.push("shape=umlActor");
  else if (el.shape === "uml-frame") parts.push("shape=umlFrame");
  else if (el.shape === "uml-note") parts.push("shape=note");
  else if (el.shape === "uml-package") parts.push("shape=package");
  else if (el.shape === "uml-component") parts.push("shape=component");
  else if (el.type === "ellipse") parts.push("shape=ellipse");
  else if (el.type === "diamond") parts.push("shape=rhombus");
  if (el.fill && el.fill !== "transparent") parts.push(`fillColor=${el.fill}`);
  if (el.stroke && el.stroke !== "#1b1b1f") parts.push(`strokeColor=${el.stroke}`);
  if (el.dashed || el.strokeType === "dashed") parts.push("dashed=1");
  if (el.text) {
    parts.push("html=1;whiteSpace=wrap");
    if (el.textAlign === "left") parts.push("align=left");
    else if (el.textAlign === "right") parts.push("align=right");
  }
  return parts.join(";");
}

function edgeStyle(el: El): string {
  const parts = ["edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1"];
  if (el.type === "arrow") parts.push("endArrow=classic");
  else parts.push("endArrow=none");
  if (el.dashed || el.strokeType === "dashed") parts.push("dashed=1");
  if (el.stroke && el.stroke !== "#1b1b1f") parts.push(`strokeColor=${el.stroke}`);
  if (el.textAlign === "left") parts.push("align=left");
  else if (el.textAlign === "right") parts.push("align=right");
  return parts.join(";");
}

/** Export board elements to a minimal draw.io XML document. */
export function exportDrawio(els: El[], appState?: AppState): string {
  const vertexIds = new Map<string, string>();
  let cellId = 2; // 0 = root, 1 = default parent
  const cells: string[] = [];

  const vertices = els.filter((e) => e.type !== "line" && e.type !== "arrow");
  const edges = els.filter((e) => e.type === "line" || e.type === "arrow");

  for (const el of vertices) {
    const id = String(cellId++);
    vertexIds.set(el.id, id);
    const x = Math.round(el.x), y = Math.round(el.y);
    const w = Math.round(Math.abs(el.w || 120)), h = Math.round(Math.abs(el.h || 60));
    const value = el.text ? `value="${encodeValue(el.text)}"` : "";
    const linkAttr = el.link ? `link="${escapeXml(el.link)}"` : "";
    if (el.type === "image" && el.image) {
      const style = `shape=image;image=${escapeXml(el.image)};aspect=fixed;`;
      const geo = `<mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry" />`;
      cells.push(`<mxCell id="${id}" ${value} ${linkAttr} style="${style}" vertex="1" parent="1">${geo}</mxCell>`);
      continue;
    }
    const style = shapeStyle(el);
    const geo = `<mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry" />`;
    cells.push(`<mxCell id="${id}" ${value} ${linkAttr} style="${escapeXml(style)}" vertex="1" parent="1">${geo}</mxCell>`);
  }

  for (const el of edges) {
    if (!el.points || el.points.length < 4) continue;
    const id = String(cellId++);
    const style = edgeStyle(el);
    const pts = el.points;
    const start = { x: pts[0], y: pts[1] };
    const end = { x: pts[pts.length - 2], y: pts[pts.length - 1] };
    const waypoints = pts.slice(2, pts.length - 2);
    const wpArr: string[] = [];
    for (let i = 0; i < waypoints.length; i += 2) {
      wpArr.push(`<mxPoint x="${el.x + waypoints[i]}" y="${el.y + waypoints[i + 1]}" as="offset" />`);
    }
    const sourceAttr = el.bindStart && vertexIds.has(el.bindStart.id) ? `source="${vertexIds.get(el.bindStart.id)}"` : "";
    const targetAttr = el.bindEnd && vertexIds.has(el.bindEnd.id) ? `target="${vertexIds.get(el.bindEnd.id)}"` : "";
    const value = el.text ? `value="${encodeValue(el.text)}"` : "";
    const linkAttr = el.link ? `link="${escapeXml(el.link)}"` : "";
    const arr = wpArr.length ? `<Array as="points">${wpArr.join("")}</Array>` : "";
    const geo = `<mxGeometry relative="1" as="geometry"><mxPoint x="${el.x + start.x}" y="${el.y + start.y}" as="sourcePoint" /><mxPoint x="${el.x + end.x}" y="${el.y + end.y}" as="targetPoint" />${arr}</mxGeometry>`;
    cells.push(`<mxCell id="${id}" ${value} ${linkAttr} style="${escapeXml(style)}" edge="1" parent="1" ${sourceAttr} ${targetAttr}>${geo}</mxCell>`);
  }

  const bgAttr = appState?.background ? ` background="${escapeXml(appState.background)}"` : "";
  const gridAttr = typeof appState?.grid === "boolean" ? ` grid="${appState.grid ? "1" : "0"}"` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="drawboard" modified="${new Date().toISOString()}" agent="drawboard" version="1.0" etag="none" type="device">
  <diagram id="drawboard-export" name="Page-1">
    <mxGraphModel dx="1434" dy="780"${gridAttr} gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0"${bgAttr}>
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        ${cells.join("\n        ")}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
}
