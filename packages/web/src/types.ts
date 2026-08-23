// Shared types for scene elements and integration declarations.

export type ElementType =
  | "rect" | "ellipse" | "diamond" | "line" | "arrow"
  | "freedraw" | "text" | "icon" | "shape" | "image";

export type HeadType = "none" | "arrow" | "triangle" | "dot";
export type LineKind = "sharp" | "curve" | "elbow";
export type StrokeType = "solid" | "dashed" | "dotted";
export type EdgeKind = "sharp" | "round";
export type FillPattern = "solid" | "hatch" | "crosshatch";
export type TextVerticalAlign = "top" | "middle" | "bottom";

export interface El {
  id: string;
  type: ElementType;
  x: number; y: number; w: number; h: number;
  angle: number;
  stroke: string;
  fill: string;          // "transparent" or color
  strokeWidth: number;
  opacity: number;       // 0..1
  dashed: boolean;       // legacy — superseded by strokeType
  strokeType?: StrokeType; // solid | dashed | dotted (fallback: dashed flag)
  roughness: number;     // 0 = crisp, >0 sketchy jitter
  fillPattern?: FillPattern; // solid | hatch | crosshatch
  points?: number[];     // flat [x0,y0,x1,y1,...] relative to x,y
  curve?: boolean;       // legacy — superseded by lineType
  lineType?: LineKind;   // line/arrow: sharp | curve | elbow (fallback: curve flag)
  headStart?: HeadType;  // arrow: head shape at the start point (default none)
  headEnd?: HeadType;    // arrow: head shape at the end point (default arrow)
  edges?: EdgeKind;      // rect/diamond: sharp | round corners (default sharp)
  text?: string;
  fontSize?: number;
  textAlign?: "left" | "center" | "right";
  textVerticalAlign?: TextVerticalAlign;
  link?: string;          // optional URL attached to the element
  groupId?: string;       // optional group membership
  labelDx?: number;      // line/arrow label offset from the midpoint
  labelDy?: number;
  // arrow endpoint → shape attachment (fractional bbox coords, so resize keeps it)
  bindStart?: { id: string; fx: number; fy: number };
  bindEnd?: { id: string; fx: number; fy: number };
  shape?: string;        // parametric renderer id (e.g. "uml-class")
  svg?: string;          // icon svg body
  image?: string;        // pasted image as base64 data URL
  data?: Record<string, string>; // shape-specific text fields (e.g. UML class compartments)
  seed: number;          // deterministic jitter seed
  updatedAt: number;     // last-write-wins merge for collab
}

export interface Viewport { x: number; y: number; zoom: number; }

export interface AppState {
  background?: string;
  grid?: boolean;
}

export interface DrawDecl {
  id: string; label: string; category: string;
  kind: "icon" | "shape";
  svg?: string; shape?: string;
  width?: number; height?: number;
  /** Space-separated hidden search terms (≤120 chars). */
  keywords?: string;
  /** Optional tooltip shown on hover in the shapes library. */
  tooltip?: string;
}
export interface ReactionDecl { id: string; emoji: string; label: string; }
export interface CanvasTheme {
  background: string; gridColor: string; stroke: string;
  palette: string[]; fillStyle: string; roughness: number; selectionBox: string;
}
export interface ThemeDecl {
  id: string; label: string; dark: boolean;
  vars: Record<string, string>; canvas: CanvasTheme;
}
export interface CommandDecl { id: string; label: string; shortcut?: string; action: string; }

export interface ImportDecl { id: string; label: string; extensions: string[]; multiple?: boolean; }

export interface ImportResult { elements: El[]; appState?: AppState; }

export interface ExportDecl { id: string; label: string; extension: string; mimeType: string; }

export interface Declaration {
  name: string; version: string; description: string; author: string; builtin: boolean;
  draws?: DrawDecl[]; reactions?: ReactionDecl[]; themes?: ThemeDecl[]; commands?: CommandDecl[];
  imports?: ImportDecl[]; exports?: ExportDecl[];
}

export interface User { id: string; name: string; email: string; }
export interface Org { id: string; name: string; ownerId: string; memberIds: string[]; }
export interface Folder {
  id: string; orgId: string; name: string;
  parentId?: string; createdAt: string;
}
export interface BoardMeta {
  id: string; orgId: string; name: string; ownerId: string;
  folderId?: string; shared: boolean; thumbnail?: string; createdAt: string; updatedAt: string;
}
export interface BoardFull extends BoardMeta { elements: El[]; appState: AppState; }

export const uid = () =>
  "el_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
