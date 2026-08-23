import type { El } from "../../types";
import { Shape, applyBboxHandle, bboxBounds, bboxHandles, bboxSnapKeyPoints, rectHitTest, type TextEditTarget } from "../shape";
import { applyStroke, mulberry32, sketchStroke } from "../draw-utils";

const MIN_SECTION_H = 18;
const SECTION_PAD = 6;
const LINE_HEIGHT = (size: number) => size * 1.3;

function sectionLines(text: string | undefined): string[] {
  return (text || "").split("\n").filter((l) => l.length > 0);
}

function sectionHeight(lines: string[], size: number): number {
  const h = Math.max(0, lines.length) * LINE_HEIGHT(size) + SECTION_PAD * 2;
  return Math.max(MIN_SECTION_H, h);
}

function splitTypedLine(line: string): [string, string | null] {
  // Right-side type annotation: name : type, name -> type, name => type, name :: type
  const rightSeps = ["::", "→", "->", "=>", ":"];
  let best = -1;
  let sepLen = 1;
  for (const sep of rightSeps) {
    const idx = line.lastIndexOf(sep);
    if (idx > best) { best = idx; sepLen = sep.length; }
  }
  if (best !== -1) {
    const name = line.slice(0, best).trim();
    const type = line.slice(best + sepLen).trim();
    if (name && type) return [name, type];
  }

  // Go-style return type after closing paren: func Name() Type
  const closeIdx = line.indexOf(")");
  if (closeIdx > 0) {
    const after = line.slice(closeIdx + 1).trim();
    if (after && !after.includes(" ")) {
      const nameMatch = line.match(/(?:^|\s)(\S+)\s*\(/);
      if (nameMatch) return [nameMatch[1] + line.slice(line.indexOf("("), closeIdx + 1), after];
    }
  }

  // Left-side type annotation: Type name()  or  Type name
  const parenIdx = line.indexOf("(");
  if (parenIdx > 0) {
    const before = line.slice(0, parenIdx).trim();
    const after = line.slice(parenIdx);
    const m = before.match(/(\S+)$/);
    if (m) {
      const name = m[1] + after.slice(0, after.indexOf(")") + 1);
      const type = before.slice(0, before.length - m[1].length).trim();
      if (type) return [name, type];
    }
  }

  return [line.trim(), null];
}

function drawParametric(ctx: CanvasRenderingContext2D, el: El, hideText: boolean | string = false) {
  applyStroke(ctx, el);
  const rand = mulberry32(el.seed);
  const { x, y, w, h } = el;
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    sketchStroke(ctx, el, rand, [[x0, y0], [x1, y1]]);
  };
  const shouldHide = (field?: string) => hideText === true || (typeof hideText === "string" && hideText === field);
  const label = (t: string, tx: number, ty: number, size = 14, bold = false) => {
    if (hideText) return;
    ctx.save();
    ctx.fillStyle = el.stroke; ctx.globalAlpha = el.opacity;
    ctx.font = `${bold ? "600 " : ""}${size}px 'Segoe UI', system-ui, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(t, tx, ty);
    ctx.restore();
  };
  const multiline = (text: string, cx: number, top: number, size: number, field?: string) => {
    if (shouldHide(field)) return;
    const lines = sectionLines(text);
    if (!lines.length) return;
    const lh = LINE_HEIGHT(size);
    ctx.save();
    ctx.fillStyle = el.stroke; ctx.globalAlpha = el.opacity;
    ctx.font = `${size}px 'Segoe UI', system-ui, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    let yy = top + SECTION_PAD + lh / 2;
    for (const l of lines) {
      ctx.fillText(l, cx, yy);
      yy += lh;
    }
    ctx.restore();
  };
  const typedSection = (text: string, sx: number, top: number, sw: number, sh: number, size: number, field?: string) => {
    if (shouldHide(field)) return;
    const lines = sectionLines(text);
    if (!lines.length) return;
    const lh = LINE_HEIGHT(size);
    ctx.save();
    ctx.fillStyle = el.stroke; ctx.globalAlpha = el.opacity;
    ctx.font = `${size}px 'Segoe UI', system-ui, sans-serif`;
    ctx.textBaseline = "middle";
    const leftX = sx + SECTION_PAD;
    const rightX = sx + sw - SECTION_PAD;
    let yy = top + SECTION_PAD + lh / 2;
    for (const l of lines) {
      const [name, type] = splitTypedLine(l);
      ctx.textAlign = "left";
      ctx.fillText(name, leftX, yy);
      if (type) {
        ctx.textAlign = "right";
        ctx.fillText(type, rightX, yy);
      }
      yy += lh;
    }
    ctx.restore();
  };

  switch (el.shape) {
    case "uml-class": case "uml-interface": {
      const d = el.data || {};
      const isInterface = el.shape === "uml-interface";
      const name = d.name ?? el.text ?? (isInterface ? "«interface»" : "Class");
      const attributes = d.attributes ?? "";
      const methods = d.methods ?? "";
      const headerSize = 14;
      const bodySize = 11;

      const headerLines = isInterface ? ["«interface»", name] : [name];
      const headerH = sectionHeight(headerLines, headerSize);
      const attrsH = sectionHeight(sectionLines(attributes), bodySize);
      const methodsH = sectionHeight(sectionLines(methods), bodySize);

      if (el.fill !== "transparent") { ctx.fillStyle = el.fill; ctx.fillRect(x, y, w, h); }
      sketchStroke(ctx, el, rand, [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]);
      line(x, y + headerH, x + w, y + headerH);
      line(x, y + headerH + attrsH, x + w, y + headerH + attrsH);

      const cx = x + w / 2;
      const headerLineH = LINE_HEIGHT(headerSize);
      const headerTop = y + (headerH - headerLines.length * headerLineH) / 2;
      headerLines.forEach((l, i) => {
        if (!shouldHide("name")) {
          ctx.save();
          ctx.fillStyle = el.stroke; ctx.globalAlpha = el.opacity;
          ctx.font = `${i === 0 && !isInterface ? "600 " : ""}${headerSize}px 'Segoe UI', system-ui, sans-serif`;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(l, cx, headerTop + headerLineH / 2 + i * headerLineH);
          ctx.restore();
        }
      });

      multiline(attributes, cx, y + headerH, bodySize, "attributes");
      multiline(methods, cx, y + headerH + attrsH, bodySize, "methods");
      break;
    }
    case "uml-class-typed": {
      const d = el.data || {};
      const name = d.name ?? el.text ?? "Class";
      const attributes = d.attributes ?? "";
      const methods = d.methods ?? "";
      const headerSize = 14;
      const bodySize = 11;

      const headerLines = [name];
      const headerH = sectionHeight(headerLines, headerSize);
      const attrsH = sectionHeight(sectionLines(attributes), bodySize);
      const methodsH = sectionHeight(sectionLines(methods), bodySize);

      if (el.fill !== "transparent") { ctx.fillStyle = el.fill; ctx.fillRect(x, y, w, h); }
      sketchStroke(ctx, el, rand, [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]);
      line(x, y + headerH, x + w, y + headerH);
      line(x, y + headerH + attrsH, x + w, y + headerH + attrsH);

      const cx = x + w / 2;
      if (!shouldHide("name")) {
        ctx.save();
        ctx.fillStyle = el.stroke; ctx.globalAlpha = el.opacity;
        ctx.font = `600 ${headerSize}px 'Segoe UI', system-ui, sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(name, cx, y + headerH / 2);
        ctx.restore();
      }

      typedSection(attributes, x, y + headerH, w, attrsH, bodySize, "attributes");
      typedSection(methods, x, y + headerH + attrsH, w, methodsH, bodySize, "methods");
      break;
    }
    case "uml-actor": {
      const cx = x + w / 2;
      ctx.beginPath(); ctx.arc(cx, y + h * 0.14, h * 0.12, 0, Math.PI * 2); ctx.stroke();
      line(cx, y + h * 0.26, cx, y + h * 0.62);
      line(cx - w * 0.3, y + h * 0.36, cx + w * 0.3, y + h * 0.36);
      line(cx, y + h * 0.62, cx - w * 0.28, y + h * 0.95);
      line(cx, y + h * 0.62, cx + w * 0.28, y + h * 0.95);
      label(el.text || "Actor", cx, y + h + 8, 12);
      break;
    }
    case "uml-usecase": {
      ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      if (el.fill !== "transparent") { ctx.fillStyle = el.fill; ctx.fill(); }
      ctx.stroke();
      label(el.text || "Use case", x + w / 2, y + h / 2);
      break;
    }
    case "uml-package": {
      const tab = w * 0.4, th = 16;
      if (el.fill !== "transparent") { ctx.fillStyle = el.fill; ctx.fillRect(x, y + th, w, h - th); }
      sketchStroke(ctx, el, rand, [[x, y], [x + tab, y], [x + tab, y + th], [x, y + th], [x, y]]);
      sketchStroke(ctx, el, rand, [[x, y + th], [x + w, y + th], [x + w, y + h], [x, y + h], [x, y + th]]);
      label(el.text || "Package", x + tab / 2, y + th / 2, 11);
      break;
    }
    case "uml-note": {
      const fold = 14;
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + w - fold, y); ctx.lineTo(x + w, y + fold);
      ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
      if (el.fill !== "transparent") { ctx.fillStyle = el.fill; ctx.fill(); }
      ctx.stroke();
      line(x + w - fold, y, x + w - fold, y + fold);
      line(x + w - fold, y + fold, x + w, y + fold);
      label(el.text || "note", x + w / 2, y + h / 2, 12);
      break;
    }
    case "uml-component": {
      if (el.fill !== "transparent") { ctx.fillStyle = el.fill; ctx.fillRect(x + 10, y, w - 10, h); }
      ctx.strokeRect(x + 10, y, w - 10, h);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.strokeRect(x, y + h * 0.25, 12, h * 0.18);
      ctx.strokeRect(x, y + h * 0.57, 12, h * 0.18);
      label(el.text || "Component", x + w / 2 + 5, y + h / 2);
      break;
    }
    case "uml-lifeline": {
      const cx = x + w / 2;
      if (el.fill !== "transparent") { ctx.fillStyle = el.fill; ctx.fillRect(cx - 40, y, 80, 28); }
      ctx.strokeRect(cx - 40, y, 80, 28);
      label(el.text || "Object", cx, y + 14, 12);
      ctx.save();
      ctx.setLineDash([6, 5]);
      line(cx, y + 28, cx, y + h);
      ctx.restore();
      break;
    }
    case "uml-frame": {
      sketchStroke(ctx, el, rand, [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]);
      const tw = 60, thh = 20;
      sketchStroke(ctx, el, rand, [[x, y], [x + tw, y], [x + tw, y + thh], [x, y + thh], [x, y]]);
      label(el.text || "sd", x + tw / 2, y + thh / 2, 11, true);
      break;
    }
    default: {
      ctx.strokeRect(x, y, w, h);
      label(el.text || el.shape || "shape", x + w / 2, y + h / 2, 12);
    }
  }
}

function umlClassSectionHeights(el: El): { headerH: number; attrsH: number; methodsH: number } {
  const d = el.data || {};
  const isInterface = el.shape === "uml-interface";
  const isTyped = el.shape === "uml-class-typed";
  const name = d.name ?? el.text ?? (isInterface ? "«interface»" : "Class");
  const headerLines = isInterface ? ["«interface»", name] : [name];
  return {
    headerH: sectionHeight(headerLines, 14),
    attrsH: sectionHeight(sectionLines(d.attributes ?? ""), 11),
    methodsH: sectionHeight(sectionLines(d.methods ?? ""), 11),
  };
}

function umlClassDoubleClick(el: El, wx: number, wy: number): TextEditTarget {
  const { x, y, w, h } = el;
  const cx = x + w / 2;
  const d = el.data || {};
  const isTyped = el.shape === "uml-class-typed";
  const { headerH, attrsH } = umlClassSectionHeights(el);
  if (wy < y + headerH) {
    return { x: cx, y: y + headerH / 2, value: d.name ?? el.text ?? "", field: "name", align: "center", multiline: true };
  }
  if (wy < y + headerH + attrsH) {
    const inset = SECTION_PAD * 2;
    return {
      x: x + inset,
      y: y + headerH + attrsH / 2,
      value: d.attributes ?? "",
      field: "attributes",
      align: "left",
      multiline: true,
      width: Math.max(60, w - inset * 2),
    };
  }
  const inset = SECTION_PAD * 2;
  return {
    x: x + inset,
    y: y + headerH + attrsH + (h - headerH - attrsH) / 2,
    value: d.methods ?? "",
    field: "methods",
    align: "left",
    multiline: true,
    width: Math.max(60, w - inset * 2),
  };
}

function defaultDoubleClick(el: El): TextEditTarget {
  return { x: el.x + el.w / 2, y: el.y + el.h / 2, value: el.text ?? "", align: "center" };
}

export const parametricShape = new Shape({
  id: "shape",
  fixedRatio: false,
  render: drawParametric,
  bounds: bboxBounds,
  hitTest: rectHitTest,
  handles: (el) => bboxHandles(el),
  applyHandle: (orig, h, wx, wy, opts) => applyBboxHandle(orig, h, wx, wy, { fixedRatio: false, ...opts }),
  snapKeyPoints: bboxSnapKeyPoints,
  doubleClick: (el, wx, wy) => {
    if (el.shape === "uml-class" || el.shape === "uml-interface" || el.shape === "uml-class-typed") return umlClassDoubleClick(el, wx, wy);
    return defaultDoubleClick(el);
  },
});
