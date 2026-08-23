// Unified drawing-tool definitions. Built-in toolbar tools and
// integration/plugin draws share the same root shape (ToolDef), so every
// tool declares its properties the same way: an array of built-in property
// names (strings) or custom property objects with their own render fn.
import type { ReactNode } from "react";
import type { DrawDecl, El, EdgeKind, FillPattern, HeadType, LineKind, StrokeType, TextVerticalAlign } from "./types";
import { PointerIcon } from "./components/icons";

export interface Style {
  stroke: string; fill: string; strokeWidth: number;
  opacity: number; strokeType: StrokeType; fontSize: number;
  textAlign: "left" | "center" | "right";
  textVerticalAlign: TextVerticalAlign;
  link?: string;            // optional URL attached to the element
  lineType: LineKind;      // line/arrow only
  headStart: HeadType;     // arrow only
  headEnd: HeadType;       // arrow only
  edges: EdgeKind;         // rect/diamond only
  fillPattern: FillPattern; // rect/ellipse/diamond/shape
}

export type LayerOp = "top" | "up" | "down" | "bottom";

/** Everything a property renderer needs to read/write state. */
export interface PropRenderCtx {
  style: Style;
  hasSelection: boolean;
  apply: (patch: Partial<Style>) => void;
  applyLayer: (op: LayerOp) => void;
  tr: (key: string, vars?: Record<string, string | number>) => string;
}

/** Built-in properties any tool can opt into by name. */
export type BuiltinProp =
  | "stroke" | "fill" | "strokeWidth" | "opacity"
  | "strokeType" | "fontSize" | "textAlign" | "textVerticalAlign" | "link" | "layers" | "lineType"
  | "arrowStart" | "arrowEnd" | "edges" | "fillPattern";

/** Custom property: tool supplies its own renderer. */
export interface CustomProp {
  key: string;
  render: (ctx: PropRenderCtx) => ReactNode;
}

export type PropSpec = BuiltinProp | CustomProp;

export interface ToolDef {
  id: string;               // builtin tool id or plugin draw id
  icon: ReactNode;
  label: string;            // i18n key for builtins, plain text for plugins
  hotkey?: string;
  category?: string;        // plugin library grouping
  /** Space-separated hidden search terms carried from DrawDecl.keywords. */
  keywords?: string;
  /** Optional tooltip shown on hover in the shapes library. */
  tooltip?: string;
  props: PropSpec[];
}

// Shared property sets.
const SHAPE_PROPS: PropSpec[] = ["stroke", "fill", "fillPattern", "strokeWidth", "opacity", "strokeType", "fontSize", "textAlign", "textVerticalAlign", "link", "layers"];
const RECT_PROPS: PropSpec[] = ["stroke", "fill", "fillPattern", "strokeWidth", "opacity", "strokeType", "edges", "fontSize", "textAlign", "textVerticalAlign", "link", "layers"];
const LINE_PROPS: PropSpec[] = ["stroke", "strokeWidth", "opacity", "strokeType", "lineType", "fontSize", "textAlign", "link", "layers"];
const ARROW_PROPS: PropSpec[] = ["stroke", "strokeWidth", "opacity", "strokeType", "lineType", "arrowStart", "arrowEnd", "fontSize", "textAlign", "link", "layers"];
const FREEHAND_PROPS: PropSpec[] = ["stroke", "strokeWidth", "opacity", "link", "layers"];
const TEXT_PROPS: PropSpec[] = ["stroke", "fontSize", "textAlign", "link", "opacity", "layers"];
const ICON_PROPS: PropSpec[] = ["stroke", "opacity", "link", "layers"];
const IMAGE_PROPS: PropSpec[] = ["opacity", "link", "layers"];

export const BUILTIN_TOOLS: ToolDef[] = [
  { id: "hand", icon: "✋", label: "tool.hand", props: [] },
  { id: "select", icon: <PointerIcon />, label: "tool.select", hotkey: "1", props: [] },
  { id: "rect", icon: "▭", label: "tool.rect", hotkey: "2", props: RECT_PROPS },
  { id: "diamond", icon: "◇", label: "tool.diamond", hotkey: "3", props: RECT_PROPS },
  { id: "ellipse", icon: "◯", label: "tool.ellipse", hotkey: "4", props: SHAPE_PROPS },
  { id: "arrow", icon: "→", label: "tool.arrow", hotkey: "5", props: ARROW_PROPS },
  { id: "line", icon: "╱", label: "tool.line", hotkey: "6", props: LINE_PROPS },
  { id: "freedraw", icon: "✏️", label: "tool.freedraw", hotkey: "7", props: FREEHAND_PROPS },
  { id: "text", icon: "T", label: "tool.text", hotkey: "8", props: TEXT_PROPS },
  { id: "eraser", icon: "🧽", label: "tool.eraser", hotkey: "0", props: [] },
];

/** Properties shown for an already-placed element (selection). */
export function propsForEl(el: El): PropSpec[] {
  switch (el.type) {
    case "rect": case "diamond": return RECT_PROPS;
    case "ellipse": case "shape": return SHAPE_PROPS;
    case "line": return LINE_PROPS;
    case "arrow": return ARROW_PROPS;
    case "freedraw": return FREEHAND_PROPS;
    case "text": return TEXT_PROPS;
    case "icon": return ICON_PROPS;
    case "image": return IMAGE_PROPS;
    default: return [];
  }
}

/** A plugin/integration draw as a ToolDef — same root object as builtins. */
export function drawToToolDef(d: DrawDecl, override?: PropSpec[]): ToolDef {
  return {
    id: d.id,
    label: d.label,
    category: d.category,
    keywords: d.keywords,
    tooltip: d.tooltip,
    icon: d.svg
      ? <span className="lib-icon"
          dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 64 64" width="26" height="26">${d.svg}</svg>` }} />
      : <span className="lib-shape">{d.label}</span>,
    props: override ?? (d.kind === "icon" ? ICON_PROPS : SHAPE_PROPS),
  };
}
