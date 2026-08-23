// Board page: the canvas editor. High-performance rendering (spatial grid
// culling, rAF-coalesced draws), full toolset, styles, themes, minimap,
// realtime collaboration, reactions, plugin draws, mobile touch support.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, getToken, REDIRECT_AFTER_LOGIN_KEY, setToken } from "../api";
import type { AppCtx } from "../App";
import { onPastedImageLoad } from "../canvas/draw-utils";
import { Scene, elBounds, elMidpoint, pointInPolygon, snapKeyPoints, snapPoint } from "../canvas/scene";
import { Renderer, colorFor, type Cursor } from "../canvas/renderer";
import { renderThumbnail } from "../canvas/snapshot";
import type { Handle } from "../canvas/shape";
import { shapeFor } from "../canvas/shape-registry";
import { CollabClient, type WireMsg } from "../collab";
import type { AppState, BoardFull, CanvasTheme, DrawDecl, El } from "../types";
import { uid } from "../types";
import Minimap from "../components/Minimap";
import ReactionLayer, { useReactionLayer } from "../components/ReactionLayer";
import ThemePicker from "../components/ThemePicker";
import { applyTheme } from "../theme";
import PluginsPanel from "../components/PluginsPanel";
import { ChevronDownIcon, SearchIcon } from "../components/icons";
import { afterPlace, allExporters, allImporters, drawPropOverride, findImporter, runAction, runExporter } from "../integrations";
import { useT } from "../i18n";
import LocaleSwitcher from "../components/LocaleSwitcher";
import { cloneForPaste, parseElements, serializeElements } from "../clipboard";
import PropsPanel from "../components/PropsPanel";
import { Tooltip } from "react-tooltip";
import "react-tooltip/dist/react-tooltip.css";
import {
  BUILTIN_TOOLS, drawToToolDef, propsForEl,
  type LayerOp, type PropSpec, type Style, type ToolDef,
} from "../tools";

const MenuIcon = ({ d, className = "menu-icon" }: { d: string; className?: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={d} />
  </svg>
);

type Tool =
  | "select" | "hand" | "rect" | "ellipse" | "diamond"
  | "line" | "arrow" | "freedraw" | "text" | "eraser";

// Letter hotkeys, plus number hotkeys derived from the tool definitions
// (Excalidraw layout: 1 select, 2 rect, 3 diamond, 4 ellipse, 5 arrow,
// 6 line, 7 freedraw, 8 text, 0 eraser).
const TOOL_KEYS: Record<string, Tool> = {
  v: "select", h: "hand", r: "rect", e: "ellipse", d: "diamond",
  l: "line", a: "arrow", f: "freedraw", t: "text", x: "eraser",
  ...Object.fromEntries(
    BUILTIN_TOOLS.filter((t) => t.hotkey).map((t) => [t.hotkey!, t.id as Tool]),
  ),
};

export default function Board({ ctx, boardId }: { ctx: AppCtx; boardId: string }) {
  const tr = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sceneRef = useRef(new Scene());
  const rendererRef = useRef<Renderer | null>(null);
  const collabRef = useRef<CollabClient | null>(null);
  const vpRef = useRef({ x: 0, y: 0, zoom: 1 });

  const [meta, setMeta] = useState<BoardFull | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [pluginTool, setPluginTool] = useState<DrawDecl | null>(null);
  const [style, setStyle] = useState<Style>({
    stroke: "#1b1b1f", fill: "transparent", strokeWidth: 2, opacity: 1, strokeType: "solid", fontSize: 20,
    textAlign: "left", lineType: "curve", headStart: "none", headEnd: "arrow", edges: "sharp", fillPattern: "solid",
  });
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<El | null>(null);
  const [cursors, setCursors] = useState<Cursor[]>([]);
  const [peers, setPeers] = useState<{ id: string; name: string }[]>([]);
  const [online, setOnline] = useState(false);
  const [themeId, setThemeId] = useState(localStorage.getItem("drawboard.theme") || "light");
  const [showMinimap, setShowMinimap] = useState(true);
  const [showReactions, setShowReactions] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showStyleBar, setShowStyleBar] = useState(true);
  const [size, setSize] = useState({ w: innerWidth, h: innerHeight });
  const [textEdit, setTextEdit] = useState<{ id: string | null; x: number; y: number; value: string; align?: "left" | "center" | "right"; field?: string; multiline?: boolean; width?: number } | null>(null);
  const [tick, setTick] = useState(0); // force minimap repaint trigger
  const [linkBubble, setLinkBubble] = useState<{ url: string; x: number; y: number } | null>(null);
  const [libSearch, setLibSearch] = useState("");
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [showShapePlugins, setShowShapePlugins] = useState(false);
  const [showLibPanel, setShowLibPanel] = useState(true);
  const [panning, setPanning] = useState(false);

  const selRegionRef = useRef<
    | { type: "rect"; x0: number; y0: number; x1: number; y1: number }
    | { type: "lasso"; points: number[] }
    | null
  >(null);

  const { floats, spawn } = useReactionLayer();
  const selectionRef = useRef(selection); selectionRef.current = selection;
  const styleRef = useRef(style); styleRef.current = style;
  const theme: CanvasTheme = useMemo(
    () => (ctx.themes.find((t) => t.id === themeId) || ctx.themes[0]).canvas,
    [ctx.themes, themeId],
  );
  const themeRef = useRef(theme); themeRef.current = theme;
  const showGridRef = useRef(showGrid); showGridRef.current = showGrid;

  const pluginDraws = useMemo(() => ctx.decls.flatMap((d) => d.draws || []), [ctx.decls]);
  const reactions = useMemo(() => ctx.decls.flatMap((d) => d.reactions || []), [ctx.decls]);
  // plugin draws as ToolDefs — same shape as the built-in tools
  const pluginToolDefs = useMemo<ToolDef[]>(
    () => pluginDraws.map((d) => drawToToolDef(d, drawPropOverride(ctx.decls, d))),
    [pluginDraws, ctx.decls],
  );

  // --- history (snapshot undo) ---
  const undoStack = useRef<El[][]>([]);
  const redoStack = useRef<El[][]>([]);
  const snapshot = () => {
    undoStack.current.push(sceneRef.current.all().map((e) => ({ ...e })));
    if (undoStack.current.length > 60) undoStack.current.shift();
    redoStack.current = [];
  };
  const undo = () => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(sceneRef.current.all().map((e) => ({ ...e })));
    sceneRef.current.replaceAll(prev);
    setSelection(new Set());
    broadcastScene(); scheduleSave(); rerender();
  };
  const redo = () => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(sceneRef.current.all().map((e) => ({ ...e })));
    sceneRef.current.replaceAll(next);
    setSelection(new Set());
    broadcastScene(); scheduleSave(); rerender();
  };

  const rerender = useCallback(() => {
    rendererRef.current?.invalidate();
    setTick((t) => t + 1);
  }, []);

  // --- persistence ---
  const saveTimer = useRef<number>(0);
  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const appState: AppState = { background: themeRef.current.background, grid: showGridRef.current };
      api.saveBoard(boardId, sceneRef.current.all(), appState).catch(() => {});
    }, 1200);
  }, [boardId]);

  // --- collab ---
  const broadcastOp = useCallback((op: { kind: "upsert" | "delete"; el?: El; id?: string }) => {
    collabRef.current?.send({ type: "op", payload: op });
  }, []);
  const broadcastScene = useCallback(() => {
    collabRef.current?.send({
      type: "op",
      payload: { kind: "scene", els: sceneRef.current.all(), order: sceneRef.current.orderIds() },
    });
  }, []);

  const handleWire = useCallback((m: WireMsg) => {
    const scene = sceneRef.current;
    switch (m.type) {
      case "presence":
        setPeers(m.payload || []);
        break;
      case "join":
        setPeers((p) => [...p.filter((x) => x.id !== m.from), { id: m.from!, name: m.name || "Guest" }]);
        break;
      case "leave":
        setPeers((p) => p.filter((x) => x.id !== m.from));
        setCursors((c) => c.filter((x) => x.id !== m.from));
        break;
      case "cursor":
        setCursors((c) => {
          const rest = c.filter((x) => x.id !== m.from);
          return [...rest, { id: m.from!, name: m.name || "", x: m.payload.x, y: m.payload.y, color: colorFor(m.from!) }];
        });
        rerender();
        break;
      case "reaction": {
        const r = rendererRef.current;
        if (r) {
          const sx = (m.payload.x - r.vp.x) * r.vp.zoom;
          const sy = (m.payload.y - r.vp.y) * r.vp.zoom;
          spawn(m.payload.emoji, sx, sy, m.name);
        }
        break;
      }
      case "op": {
        const op = m.payload;
        if (op.kind === "upsert" && op.el) {
          const existing = scene.get(op.el.id);
          if (!existing || existing.updatedAt <= op.el.updatedAt) scene.upsert(op.el);
        } else if (op.kind === "delete") {
          scene.remove(op.id);
        } else if (op.kind === "scene") {
          // last-write-wins per element merge
          for (const el of op.els as El[]) {
            const existing = scene.get(el.id);
            if (!existing || existing.updatedAt <= el.updatedAt) scene.upsert(el);
          }
          if (Array.isArray(op.order)) scene.setOrder(op.order);
        }
        scheduleSave(); // persist merged scene
        rerender();
        break;
      }
    }
  }, [rerender, scheduleSave, spawn]);

  // --- load board, connect collab ---
  useEffect(() => {
    let disposed = false;
    api.board(boardId).then((b) => {
      if (disposed) return;
      setMeta(b);
      sceneRef.current.replaceAll(Array.isArray(b.elements) ? b.elements : []);
      // Restore saved canvas settings (background / grid).
      const as = b.appState || {};
      const bg = as.background || (as as any).theme;
      if (bg) {
        const match = ctx.themes.find((t) => t.canvas.background === bg);
        if (match) {
          setThemeId(match.id);
          localStorage.setItem("drawboard.theme", match.id);
          applyTheme(match);
        }
      }
      if (typeof as.grid === "boolean") setShowGrid(as.grid);
      rerender();
    }).catch((e) => {
      const isAuthError = e instanceof ApiError && (e.status === 401 || e.status === 403);
      if (isAuthError && (!getToken() || !ctx.user)) {
        setToken("");
        sessionStorage.setItem(REDIRECT_AFTER_LOGIN_KEY, location.hash);
        location.hash = "#/login";
        return;
      }
      alert(e instanceof Error ? e.message : String(e));
    });
    const client = new CollabClient(boardId, handleWire, setOnline);
    collabRef.current = client;
    return () => {
      disposed = true; client.close(); clearTimeout(saveTimer.current);
      // snapshot the scene as the board card thumbnail; fire-and-forget
      if (getToken()) {
        const thumb = renderThumbnail(sceneRef.current.all(), themeRef.current.background);
        if (thumb) api.saveThumbnail(boardId, thumb).catch(() => {});
      }
    };
  }, [boardId, handleWire, rerender]);

  // --- renderer lifecycle ---
  useEffect(() => {
    const canvas = canvasRef.current!, wrap = wrapRef.current!;
    const r = new Renderer(canvas, sceneRef.current, vpRef.current, themeRef.current,
      () => ({
        selection: selectionRef.current,
        draft: draftRef.current,
        cursors: cursorsRef.current,
        editing: { id: textEditRef.current?.id ?? null, field: textEditRef.current?.field },
        snapHints: snapHintsRef.current,
        selRegion: selRegionRef.current,
      }));
    rendererRef.current = r;
    const ro = new ResizeObserver(() => {
      const rect = wrap.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });
      r.resize(rect.width, rect.height);
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (rendererRef.current) { rendererRef.current.theme = theme; rerender(); }
  }, [theme, rerender]);

  useEffect(() => {
    if (rendererRef.current) { rendererRef.current.showGrid = showGrid; rerender(); }
  }, [showGrid, rerender]);

  // hide the element's canvas text while its editor is open
  useEffect(() => { rerender(); }, [textEdit, rerender]);

  // selection boxes are canvas-drawn — repaint whenever the selection changes
  useEffect(() => { rerender(); }, [selection, rerender]);

  // Floating link bubble above a single selected element that has a link.
  useEffect(() => {
    if (selection.size !== 1) { setLinkBubble(null); return; }
    const id = [...selection][0];
    const el = sceneRef.current.get(id);
    if (!el?.link) { setLinkBubble(null); return; }
    const b = elBounds(el);
    const { x, y, zoom } = vpRef.current;
    setLinkBubble({
      url: el.link,
      x: ((b.x0 + b.x1) / 2 - x) * zoom,
      y: (b.y0 - y) * zoom - 8,
    });
  }, [selection, tick]);

  useEffect(() => {
    const onTheme = (e: Event) => setThemeId((e as CustomEvent).detail);
    addEventListener("themechange", onTheme);
    return () => removeEventListener("themechange", onTheme);
  }, []);

  // close the hamburger menu when clicking outside of it
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as Element).closest(".nav-float")) setMenuOpen(false);
    };
    addEventListener("mousedown", close);
    return () => removeEventListener("mousedown", close);
  }, [menuOpen]);

  const draftRef = useRef(draft); draftRef.current = draft;
  const cursorsRef = useRef(cursors); cursorsRef.current = cursors;
  const textEditRef = useRef(textEdit); textEditRef.current = textEdit;
  const snapHintsRef = useRef<{ x: number; y: number }[]>([]);

  // --- interaction state machine ---
  const gesture = useRef<{
    mode: "none" | "draw" | "move" | "resize" | "label" | "pan" | "maybe" | "selectRect" | "lasso";
    startWX: number; startWY: number; orig: Map<string, El>;
    pointerId: number; moved: boolean; handle: Handle | null;
    pendingToggle: string | null; // shift+click multi-select candidate
    undoSnapshot: El[] | null; // full scene captured at pointer-down for undo after drag
    lasso?: number[];
  }>({ mode: "none", startWX: 0, startWY: 0, orig: new Map(), pointerId: -1, moved: false, handle: null, pendingToggle: null, undoSnapshot: null });

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; zoom: number } | null>(null);

  const toWorld = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return rendererRef.current!.toWorld(e.clientX - rect.left, e.clientY - rect.top);
  };

  const makeEl = (type: El["type"], wx: number, wy: number, extra?: Partial<El>): El => ({
    id: uid(), type, x: wx, y: wy, w: 0, h: 0, angle: 0,
    stroke: styleRef.current.stroke, fill: styleRef.current.fill,
    strokeWidth: styleRef.current.strokeWidth, opacity: styleRef.current.opacity,
    dashed: styleRef.current.strokeType === "dashed", // legacy field
    strokeType: styleRef.current.strokeType, fontSize: styleRef.current.fontSize,
    textAlign: styleRef.current.textAlign,
    lineType: styleRef.current.lineType,
    headStart: styleRef.current.headStart, headEnd: styleRef.current.headEnd,
    edges: styleRef.current.edges,
    fillPattern: styleRef.current.fillPattern,
    roughness: themeRef.current.roughness,
    seed: Math.floor(Math.random() * 2 ** 31), updatedAt: Date.now(), ...extra,
  });

  const commitEl = (el: El) => {
    el.updatedAt = Date.now();
    sceneRef.current.upsert(el);
    broadcastOp({ kind: "upsert", el });
    scheduleSave();
  };

  // Expand a selection to include every member of any selected group.
  const expandGroups = (ids: Set<string>): Set<string> => {
    const out = new Set(ids);
    const groupIds = new Set<string>();
    for (const id of ids) {
      const el = sceneRef.current.get(id);
      if (el?.groupId) groupIds.add(el.groupId);
    }
    if (!groupIds.size) return out;
    for (const el of sceneRef.current.all()) {
      if (el.groupId && groupIds.has(el.groupId)) out.add(el.id);
    }
    return out;
  };

  const groupSelection = () => {
    if (selectionRef.current.size < 2) return;
    snapshot();
    const gid = uid();
    for (const id of selectionRef.current) {
      const el = sceneRef.current.get(id);
      if (!el) continue;
      const upd = { ...el, groupId: gid, updatedAt: Date.now() };
      sceneRef.current.upsert(upd);
      broadcastOp({ kind: "upsert", el: upd });
    }
    scheduleSave(); rerender();
  };

  const ungroupSelection = () => {
    if (!selectionRef.current.size) return;
    const groupIds = new Set<string>();
    for (const id of selectionRef.current) {
      const el = sceneRef.current.get(id);
      if (el?.groupId) groupIds.add(el.groupId);
    }
    if (!groupIds.size) return;
    snapshot();
    for (const el of sceneRef.current.all()) {
      if (el.groupId && groupIds.has(el.groupId)) {
        const upd = { ...el, groupId: undefined, updatedAt: Date.now() };
        sceneRef.current.upsert(upd);
        broadcastOp({ kind: "upsert", el: upd });
      }
    }
    scheduleSave(); rerender();
  };

  // Re-anchor arrow endpoints bound to a shape after it moved or resized.
  const updateBoundArrows = (shape: El) => {
    const x0 = Math.min(shape.x, shape.x + shape.w), x1 = Math.max(shape.x, shape.x + shape.w);
    const y0 = Math.min(shape.y, shape.y + shape.h), y1 = Math.max(shape.y, shape.y + shape.h);
    for (const el of sceneRef.current.all()) {
      if (el.type !== "arrow" || !el.points) continue;
      if (el.bindStart?.id !== shape.id && el.bindEnd?.id !== shape.id) continue;
      const pts = [...el.points];
      if (el.bindStart?.id === shape.id) {
        pts[0] = x0 + el.bindStart.fx * (x1 - x0) - el.x;
        pts[1] = y0 + el.bindStart.fy * (y1 - y0) - el.y;
      }
      if (el.bindEnd?.id === shape.id) {
        const n = pts.length;
        pts[n - 2] = x0 + el.bindEnd.fx * (x1 - x0) - el.x;
        pts[n - 1] = y0 + el.bindEnd.fy * (y1 - y0) - el.y;
      }
      sceneRef.current.upsert({ ...el, points: pts, updatedAt: Date.now() });
    }
  };

  const cursorTimer = useRef(0);
  const sendCursor = (wx: number, wy: number) => {
    const now = Date.now();
    if (now - cursorTimer.current < 50) return;
    cursorTimer.current = now;
    collabRef.current?.send({ type: "cursor", payload: { x: wx, y: wy } });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      // pinch start
      const [p1, p2] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y), zoom: vpRef.current.zoom };
      gesture.current.mode = "none";
      setDraft(null);
      return;
    }
    const { x: wx, y: wy } = toWorld(e);
    const g = gesture.current;
    g.pointerId = e.pointerId; g.moved = false;
    g.startWX = wx; g.startWY = wy;
    g.orig = new Map();
    g.undoSnapshot = null;

    const pan = e.button === 1 || tool === "hand";
    if (pan) {
      g.mode = "pan";
      setPanning(true);
      g.pendingToggle = null;
      return;
    }

    // a selected library draw takes precedence over the current toolbar tool
    if (pluginTool) {
      snapshot();
      let el = makeEl(pluginTool.kind === "icon" ? "icon" : "shape", wx, wy, {
        w: pluginTool.width || 120, h: pluginTool.height || 80,
        svg: pluginTool.svg, shape: pluginTool.shape,
      });
      // web-side integration logic may adjust the placed element
      el = afterPlace(ctx.decls, pluginTool, el);
      commitEl(el); rerender();
      setPluginTool(null);
      setTool("select"); // back to select once placed
      g.mode = "none";
      return;
    }

    if (tool === "eraser") {
      const hit = sceneRef.current.hitTest(wx, wy, 10 / vpRef.current.zoom);
      if (hit) {
        snapshot();
        sceneRef.current.remove(hit.id);
        broadcastOp({ kind: "delete", id: hit.id });
        scheduleSave(); rerender();
      }
      g.mode = "none";
      return;
    }

    if (tool === "select") {
      g.undoSnapshot = sceneRef.current.all().map((e) => ({ ...e }));
      // handle interactions only for a single selection — otherwise their
      // zones eat clicks meant for other elements.
      const th = 8 / vpRef.current.zoom;
      for (const id of selectionRef.current.size === 1 ? selectionRef.current : []) {
        let el = sceneRef.current.get(id);
        if (!el) continue;
        const shape = shapeFor(el);

        // let each shape normalize itself on selection (e.g. line 2pt -> 3pt)
        const normalized = shape.normalize?.(el);
        if (normalized) {
          sceneRef.current.upsert(normalized);
          el = normalized;
        }

        const handle = shape.handles(el).find((h) => Math.abs(wx - h.x) <= th && Math.abs(wy - h.y) <= th);
        if (handle) {
          g.mode = "resize";
          g.handle = handle;
          g.orig.set(id, { ...el, points: el.points ? [...el.points] : undefined });
          return;
        }

        // line/arrow label drag remains a special handle-like interaction
        if ((el.type === "line" || el.type === "arrow") && el.text) {
          const m = elMidpoint(el);
          const ax = m.x + (el.labelDx || 0), ay = m.y + (el.labelDy || 0);
          const fs = el.fontSize || 16;
          const lines = el.text.split("\n");
          const hw = Math.max(...lines.map((l) => l.length), 1) * fs * 0.3 + th;
          const hh = (lines.length * fs * 1.3) / 2 + th;
          if (Math.abs(wx - ax) <= hw && Math.abs(wy - ay) <= hh) {
            g.mode = "label";
            g.orig.set(id, { ...el, points: [...el.points!] });
            return;
          }
        }
      }
      const hit = sceneRef.current.hitTest(wx, wy, 10 / vpRef.current.zoom);
      if (e.shiftKey && hit) {
        g.mode = "maybe";
        g.pendingToggle = hit.id;
        return;
      }
      if (hit && selectionRef.current.has(hit.id)) {
        g.mode = "move";
        for (const id of selectionRef.current) {
          const el = sceneRef.current.get(id);
          if (el) g.orig.set(id, { ...el, points: el.points ? [...el.points] : undefined });
        }
      } else if (hit) {
        const gid = hit.groupId;
        const ids = gid
          ? sceneRef.current.all().filter((e) => e.groupId === gid).map((e) => e.id)
          : [hit.id];
        setSelection(new Set(ids));
        g.mode = "move";
        for (const id of ids) {
          const el = sceneRef.current.get(id);
          if (el) g.orig.set(id, { ...el, points: el.points ? [...el.points] : undefined });
        }
      } else {
        // empty space: drag to create a selection region (lasso with Alt)
        setSelection(new Set());
        if (e.altKey) {
          g.mode = "lasso";
          g.lasso = [wx, wy];
        } else {
          g.mode = "selectRect";
        }
      }
      return;
    }

    if (tool === "text") {
      const el = makeEl("text", wx, wy, { text: "", w: 200, h: 28 });
      setTextEdit({ id: el.id, x: wx, y: wy, value: "" });
      g.mode = "none";
      return;
    }

    // shape drawing tools
    snapshot();
    g.mode = "draw";
    if (tool === "freedraw") {
      setDraft(makeEl("freedraw", wx, wy, { points: [0, 0] }));
    } else if (tool === "line" || tool === "arrow") {
      let sx = wx, sy = wy;
      const extra: Partial<El> = { points: [0, 0, 0, 0] };
      if (tool === "arrow") {
        // snap the arrow's start onto a nearby shape
        const s = snapPoint(sceneRef.current, wx, wy, "", 12 / vpRef.current.zoom, 6 / vpRef.current.zoom);
        const shape = s && sceneRef.current.get(s.id);
        if (s && shape) {
          sx = s.x; sy = s.y;
          const x0 = Math.min(shape.x, shape.x + shape.w), x1 = Math.max(shape.x, shape.x + shape.w);
          const y0 = Math.min(shape.y, shape.y + shape.h), y1 = Math.max(shape.y, shape.y + shape.h);
          extra.bindStart = { id: s.id, fx: (s.x - x0) / (x1 - x0 || 1), fy: (s.y - y0) / (y1 - y0 || 1) };
        }
      }
      setDraft(makeEl(tool, sx, sy, extra));
    } else {
      setDraft(makeEl(tool as El["type"], wx, wy));
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // pinch zoom
    if (pinch.current && pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()];
      const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const rect = canvasRef.current!.getBoundingClientRect();
      const cx = (p1.x + p2.x) / 2 - rect.left, cy = (p1.y + p2.y) / 2 - rect.top;
      const newZoom = Math.min(6, Math.max(0.1, pinch.current.zoom * (d / (pinch.current.d || 1))));
      const vp = vpRef.current;
      vp.x += cx / vp.zoom - cx / newZoom;
      vp.y += cy / vp.zoom - cy / newZoom;
      vp.zoom = newZoom;
      rerender();
      return;
    }
    const { x: wx, y: wy } = toWorld(e);
    lastPointer.current = { x: wx, y: wy };
    sendCursor(wx, wy);
    const g = gesture.current;
    if (e.pointerId !== g.pointerId) return;
    if (Math.hypot(wx - g.startWX, wy - g.startWY) > 5 / vpRef.current.zoom) g.moved = true;

    if (g.mode === "pan") {
      vpRef.current.x = g.startWX - (e.clientX - canvasRef.current!.getBoundingClientRect().left) / vpRef.current.zoom;
      vpRef.current.y = g.startWY - (e.clientY - canvasRef.current!.getBoundingClientRect().top) / vpRef.current.zoom;
      rerender();
      return;
    }
    if (g.mode === "selectRect") {
      selRegionRef.current = { type: "rect", x0: g.startWX, y0: g.startWY, x1: wx, y1: wy };
      rerender();
      return;
    }
    if (g.mode === "lasso") {
      const pts = [...(g.lasso || []), wx, wy];
      g.lasso = pts;
      selRegionRef.current = { type: "lasso", points: pts };
      rerender();
      return;
    }
    if (g.mode === "move") {
      const dx = wx - g.startWX, dy = wy - g.startWY;
      for (const [id, orig] of g.orig) {
        const el = { ...orig, x: orig.x + dx, y: orig.y + dy, updatedAt: Date.now() };
        sceneRef.current.upsert(el);
        updateBoundArrows(el);
      }
      rerender();
      return;
    }
    if (g.mode === "resize" && g.handle) {
      const [id, orig] = [...g.orig.entries()][0];
      const shape = shapeFor(orig);
      let px = wx, py = wy;

      // arrow endpoint magnet-snap stays in Board because it needs the scene
      const pts = orig.points || [];
      const lastVertex = pts.length / 2 - 1;
      const isArrowEndpoint = shape.id === "arrow" && g.handle.role === "vertex" &&
        (g.handle.index === 0 || g.handle.index === lastVertex);
      if (isArrowEndpoint) {
        const R = 24 / vpRef.current.zoom;
        snapHintsRef.current = sceneRef.current
          .query(wx - R, wy - R, wx + R, wy + R)
          .filter((el) => el.id !== id)
          .flatMap((el) => snapKeyPoints(el).map(([x, y]) => ({ x, y })));
        const s = snapPoint(sceneRef.current, wx, wy, id, 12 / vpRef.current.zoom, 6 / vpRef.current.zoom);
        if (s) { px = s.x; py = s.y; }
      } else {
        snapHintsRef.current = [];
      }

      const patch = shape.applyHandle(orig, g.handle, px, py, { shiftKey: e.shiftKey });
      if (patch) {
        const upd: El = { ...orig, ...patch, updatedAt: Date.now() };

        // attach/detach arrow endpoint binding when snapped to a shape
        if (isArrowEndpoint) {
          const s = snapPoint(sceneRef.current, px, py, id, 12 / vpRef.current.zoom, 6 / vpRef.current.zoom);
          if (s) {
            const target = sceneRef.current.get(s.id);
            if (target) {
              const x0 = Math.min(target.x, target.x + target.w), x1 = Math.max(target.x, target.x + target.w);
              const y0 = Math.min(target.y, target.y + target.h), y1 = Math.max(target.y, target.y + target.h);
              const b = { id: s.id, fx: (px - x0) / (x1 - x0 || 1), fy: (py - y0) / (y1 - y0 || 1) };
              if (g.handle.index === 0) upd.bindStart = b; else upd.bindEnd = b;
            }
          } else {
            if (g.handle.index === 0) delete upd.bindStart; else delete upd.bindEnd;
          }
        }

        sceneRef.current.upsert(upd);
        updateBoundArrows(upd);
        rerender();
      }
      return;
    }
    if (g.mode === "label") {
      const [, orig] = [...g.orig.entries()][0];
      const m = elMidpoint(orig);
      sceneRef.current.upsert({
        ...orig, labelDx: wx - m.x, labelDy: wy - m.y, updatedAt: Date.now(),
      });
      rerender();
      return;
    }
    if (g.mode === "draw" && draftRef.current) {
      const d = { ...draftRef.current };
      let dx = wx - d.x, dy = wy - d.y;
      if (e.shiftKey && d.type !== "freedraw") {
        if (d.type === "line" || d.type === "arrow") {
          // snap to horizontal or vertical
          if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0;
        } else {
          // equal width and height, preserving drag direction
          const s = Math.max(Math.abs(dx), Math.abs(dy));
          dx = (dx < 0 ? -s : s); dy = (dy < 0 ? -s : s);
        }
      }
      if (d.type === "arrow" && !e.shiftKey) {
        // magnet-snap the dragged end onto nearby shapes (+ show hints)
        const R = 24 / vpRef.current.zoom;
        snapHintsRef.current = sceneRef.current
          .query(wx - R, wy - R, wx + R, wy + R)
          .flatMap((el) => snapKeyPoints(el).map(([x, y]) => ({ x, y })));
        const s = snapPoint(sceneRef.current, wx, wy, d.id, 12 / vpRef.current.zoom, 6 / vpRef.current.zoom);
        const shape = s && sceneRef.current.get(s.id);
        if (s && shape) {
          dx = s.x - d.x; dy = s.y - d.y;
          const x0 = Math.min(shape.x, shape.x + shape.w), x1 = Math.max(shape.x, shape.x + shape.w);
          const y0 = Math.min(shape.y, shape.y + shape.h), y1 = Math.max(shape.y, shape.y + shape.h);
          d.bindEnd = { id: s.id, fx: (s.x - x0) / (x1 - x0 || 1), fy: (s.y - y0) / (y1 - y0 || 1) };
        } else {
          delete d.bindEnd;
        }
      } else if (snapHintsRef.current.length) {
        snapHintsRef.current = [];
      }
      if (d.type === "freedraw") {
        d.points = [...(d.points || []), wx - d.x, wy - d.y];
      } else if (d.type === "line" || d.type === "arrow") {
        d.points = [0, 0, dx, dy];
      } else {
        d.w = dx; d.h = dy;
      }
      setDraft(d);
      rerender();
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const g = gesture.current;
    if (e.pointerId !== g.pointerId) return;
    const { x: wx, y: wy } = toWorld(e);
    if (snapHintsRef.current.length) { snapHintsRef.current = []; rerender(); }

    // shift+click without dragging: toggle the element in the selection
    if (g.mode === "maybe" && !g.moved && g.pendingToggle) {
      const id = g.pendingToggle;
      setSelection((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id); else n.add(id);
        return n;
      });
    } else if (g.mode === "selectRect" || g.mode === "lasso") {
      const ids = new Set<string>();
      if (g.mode === "selectRect") {
        const x0 = Math.min(g.startWX, wx), x1 = Math.max(g.startWX, wx);
        const y0 = Math.min(g.startWY, wy), y1 = Math.max(g.startWY, wy);
        for (const el of sceneRef.current.query(x0, y0, x1, y1)) {
          const b = elBounds(el);
          // only select elements fully enclosed by the bracket
          if (b.x0 >= x0 && b.x1 <= x1 && b.y0 >= y0 && b.y1 <= y1) ids.add(el.id);
        }
      } else if (g.mode === "lasso" && g.lasso) {
        const pts = g.lasso;
        const xs = pts.filter((_, i) => i % 2 === 0);
        const ys = pts.filter((_, i) => i % 2 === 1);
        const x0 = Math.min(...xs), x1 = Math.max(...xs);
        const y0 = Math.min(...ys), y1 = Math.max(...ys);
        for (const el of sceneRef.current.query(x0, y0, x1, y1)) {
          const b = elBounds(el);
          // only select elements fully enclosed by the lasso
          if (
            pointInPolygon(b.x0, b.y0, pts) &&
            pointInPolygon(b.x1, b.y0, pts) &&
            pointInPolygon(b.x0, b.y1, pts) &&
            pointInPolygon(b.x1, b.y1, pts)
          ) ids.add(el.id);
        }
      }
      setSelection(expandGroups(ids));
      selRegionRef.current = null;
      rerender();
    }
    g.pendingToggle = null;

    if ((g.mode === "move" || g.mode === "resize" || g.mode === "label") && g.moved) {
      for (const [id] of g.orig) {
        const el = sceneRef.current.get(id);
        if (el) { broadcastOp({ kind: "upsert", el }); }
      }
      // arrows re-anchored by a bound shape's move/resize also changed
      for (const el of sceneRef.current.all()) {
        if (el.type === "arrow" &&
            ((el.bindStart && g.orig.has(el.bindStart.id)) || (el.bindEnd && g.orig.has(el.bindEnd.id)))) {
          broadcastOp({ kind: "upsert", el });
        }
      }
      if (g.undoSnapshot) {
        undoStack.current.push(g.undoSnapshot);
        if (undoStack.current.length > 60) undoStack.current.shift();
        redoStack.current = [];
      }
      scheduleSave();
      rerender();
    }
    if (g.mode === "draw" && draftRef.current) {
      const d = draftRef.current;
      const tiny = d.type === "freedraw"
        ? (d.points?.length || 0) < 4
        : Math.abs(d.w) < 3 && Math.abs(d.h) < 3 &&
          !(d.points && Math.hypot(d.points[2], d.points[3]) > 4);
      setDraft(null);
      if (!tiny) {
        if (d.type !== "freedraw" && d.type !== "line" && d.type !== "arrow") {
          // normalize negative w/h
          if (d.w < 0) { d.x += d.w; d.w = -d.w; }
          if (d.h < 0) { d.y += d.h; d.h = -d.h; }
        } else if (d.points && d.points.length === 4) {
          // lines/arrows get a draggable middle point
          const [x0, y0, x1, y1] = d.points;
          d.points = [x0, y0, (x0 + x1) / 2, (y0 + y1) / 2, x1, y1];
        }
        commitEl(d);
        setSelection(new Set([d.id]));
        setTool("select"); // back to select once something is drawn
      } else {
        undoStack.current.pop(); // nothing drawn — discard snapshot
      }
      rerender();
    }
    g.mode = "none";
    setPanning(false);
  };

  // wheel: zoom at cursor (ctrl) or pan
  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const vp = vpRef.current;
    if (e.ctrlKey || e.metaKey) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * 0.003);
      const newZoom = Math.min(6, Math.max(0.1, vp.zoom * factor));
      vp.x += cx / vp.zoom - cx / newZoom;
      vp.y += cy / vp.zoom - cy / newZoom;
      vp.zoom = newZoom;
    } else {
      vp.x += e.deltaX / vp.zoom;
      vp.y += e.deltaY / vp.zoom;
    }
    rerender();
  }, [rerender]);

  useEffect(() => {
    const c = canvasRef.current!;
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  // double-click → shape-specific text edit target (empty space creates a text element)
  const onDblClick = (e: React.MouseEvent) => {
    const { x: wx, y: wy } = toWorld(e);
    const hit = sceneRef.current.hitTest(wx, wy, 10 / vpRef.current.zoom);
    if (!hit) {
      const el = makeEl("text", wx, wy, { text: "", w: 200, h: 28 });
      setTextEdit({ id: el.id, x: wx, y: wy, value: "", align: "center" });
      return;
    }
    const target = shapeFor(hit).doubleClick(hit, wx, wy);
    if (target) setTextEdit({ id: hit.id, ...target });
  };

  const commitText = () => {
    if (!textEdit) return;
    const existing = textEdit.id ? sceneRef.current.get(textEdit.id) : null;
    if (!textEdit.value.trim()) {
      setTextEdit(null);
      return;
    }
    snapshot();
    if (existing) {
      const upd = { ...existing, updatedAt: Date.now() };
      if (textEdit.field) {
        // write to a shape-specific data field (e.g. UML class compartments)
        upd.data = { ...existing.data, [textEdit.field]: textEdit.value };
      } else {
        upd.text = textEdit.value;
        if (existing.type === "line" || existing.type === "arrow") {
          // keep the label offset relative to the midpoint
          const m = elMidpoint(existing);
          upd.labelDx = textEdit.x - m.x;
          upd.labelDy = textEdit.y - m.y;
        }
      }
      commitEl(upd);
    } else {
      const el = makeEl("text", textEdit.x, textEdit.y, { text: textEdit.value, w: 200, h: 28 });
      commitEl(el);
    }
    setTextEdit(null);
    setTool("select"); // back to select once text is committed
    rerender();
  };

  // --- cross-board copy/paste (JSON payload on the clipboard) ---
  const internalClip = useRef<string>("");
  const [toast, setToast] = useState("");
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3500); };
  const lastPointer = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const pasteImage = async (file: File, wx: number, wy: number) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read image"));
      reader.readAsDataURL(file);
    });
    const el = await createImageElement(dataUrl, wx, wy);
    snapshot();
    sceneRef.current.upsert(el);
    broadcastOp({ kind: "upsert", el });
    setSelection(new Set([el.id]));
    scheduleSave(); rerender();
  };

  const createImageElement = (dataUrl: string, wx: number, wy: number): Promise<El> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 400;
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > maxW) { h = (h * maxW) / w; w = maxW; }
        resolve(makeEl("image", wx - w / 2, wy - h / 2, { w, h, image: dataUrl, fill: "transparent" }));
      };
      img.onerror = () => resolve(makeEl("image", wx - 100, wy - 75, { w: 200, h: 150, image: dataUrl, fill: "transparent" }));
      img.src = dataUrl;
    });
  };

  const handlePaste = async (e: ClipboardEvent) => {
    const targetEl = e.target as HTMLElement;
    if (textEdit || targetEl.tagName === "INPUT" || targetEl.tagName === "TEXTAREA") return;

    const items = e.clipboardData?.items;
    const files = e.clipboardData?.files;
    const imageFile = files?.[0]?.type.startsWith("image/") ? files[0]
      : (items ? Array.from(items).find((it) => it.type.startsWith("image/"))?.getAsFile() : undefined);

    const vp = vpRef.current, rect = wrapRef.current!.getBoundingClientRect();
    const target = lastPointer.current.x || lastPointer.current.y
      ? lastPointer.current
      : { x: vp.x + rect.width / vp.zoom / 2, y: vp.y + rect.height / vp.zoom / 2 };

    if (imageFile) {
      e.preventDefault();
      await pasteImage(imageFile, target.x, target.y);
      return;
    }

    const text = e.clipboardData?.getData("text/plain") || internalClip.current;
    if (!text) return;
    const els = parseElements(text);
    if (!els || !els.length) { if (text) flash(tr("board.pasteFailed")); return; }
    e.preventDefault();
    snapshot();
    const pasted = cloneForPaste(els, target.x, target.y);
    const ids = new Set<string>();
    for (const el of pasted) {
      sceneRef.current.upsert(el);
      broadcastOp({ kind: "upsert", el });
      ids.add(el.id);
    }
    setSelection(ids);
    scheduleSave(); rerender();
  };

  const handlePasteRef = useRef(handlePaste);
  handlePasteRef.current = handlePaste;

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (textEdit || (e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && selectionRef.current.size) {
        e.preventDefault();
        const els = [...selectionRef.current].map((id) => sceneRef.current.get(id)).filter(Boolean) as El[];
        navigator.clipboard.writeText(serializeElements(els))
          .then(() => flash(tr("board.copied", { count: els.length })))
          .catch(() => flash(tr("board.copied", { count: els.length }))); // clipboard may be blocked; still serialized internally
        internalClip.current = serializeElements(els);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g" && e.shiftKey) { e.preventDefault(); ungroupSelection(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g") { e.preventDefault(); groupSelection(); return; }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectionRef.current.size) {
          snapshot();
          for (const id of selectionRef.current) {
            sceneRef.current.remove(id);
            broadcastOp({ kind: "delete", id });
          }
          setSelection(new Set());
          scheduleSave(); rerender();
        }
        return;
      }
      if (e.key === "Escape") { setSelection(new Set()); setPluginTool(null); return; }
      const t = TOOL_KEYS[e.key.toLowerCase()];
      if (t) { setTool(t); setPluginTool(null); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  // paste: images via clipboard data, text via tagged JSON / internal fallback
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => handlePasteRef.current(e);
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  // repainted canvases once pasted raster images decode
  useEffect(() => {
    return onPastedImageLoad(() => { rerender(); setTick((t) => t + 1); });
  }, [rerender]);

  // style changes apply to current selection too
  const applyStyle = (patch: Partial<Style>) => {
    setStyle((s) => ({ ...s, ...patch }));
    if (selectionRef.current.size) {
      snapshot();
      for (const id of selectionRef.current) {
        const el = sceneRef.current.get(id);
        if (!el) continue;
        const upd = { ...el, ...patch, updatedAt: Date.now() };
        sceneRef.current.upsert(upd);
        broadcastOp({ kind: "upsert", el: upd });
      }
      scheduleSave(); rerender();
    }
  };

  // layer (z-order) ops on the current selection
  const applyLayer = (op: LayerOp) => {
    if (!selectionRef.current.size) return;
    snapshot();
    sceneRef.current.reorder(selectionRef.current, op);
    broadcastScene(); scheduleSave(); rerender();
  };

  const fireReaction = (emoji: string, x: number, y: number) => {
    spawn(emoji, x, y);
    const w = rendererRef.current!.toWorld(x, y);
    collabRef.current?.send({ type: "reaction", payload: { emoji, x: w.x, y: w.y } });
  };

  const pendingImport = useRef<{ name: string; id: string } | null>(null);

  const startImport = (name: string, id: string, extensions: string[]) => {
    pendingImport.current = { name, id };
    if (fileRef.current) {
      fileRef.current.accept = extensions.map((e) => `.${e}`).join(",");
      fileRef.current.click();
    }
    setMenuOpen(false);
  };

  // Run the importer selected from the Import menu.
  const importFile = async (f: File) => {
    const pending = pendingImport.current;
    pendingImport.current = null;
    const imp = pending ? findImporter(ctx.decls, pending.name, pending.id) : undefined;
    if (!imp) { alert(tr("board.noImporter")); return; }
    try {
      const result = imp.run(await f.text());
      const els = result.elements;
      if (!els.length) { alert(tr("board.noShapes")); return; }
      snapshot();
      // offset imported diagram near current viewport center
      const vp = vpRef.current, rect = wrapRef.current!.getBoundingClientRect();
      const cx = vp.x + rect.width / vp.zoom / 2, cy = vp.y + rect.height / vp.zoom / 2;
      const minX = Math.min(...els.map((e) => e.x)), minY = Math.min(...els.map((e) => e.y));
      const maxX = Math.max(...els.map((e) => e.x + Math.abs(e.w)));
      for (const el of els) {
        el.x += cx - (minX + maxX) / 2;
        el.y += cy - minY - 100;
        el.updatedAt = Date.now();
        sceneRef.current.upsert(el);
        broadcastOp({ kind: "upsert", el });
      }
      // Apply imported canvas settings (background, grid, etc.).
      if (result.appState) {
        if (result.appState.background) {
          const match = ctx.themes.find((t) => t.canvas.background === result.appState!.background);
          if (match) {
            setThemeId(match.id);
            localStorage.setItem("drawboard.theme", match.id);
            applyTheme(match);
          }
        }
        if (typeof result.appState.grid === "boolean") setShowGrid(result.appState.grid);
      }
      scheduleSave(); rerender();
    } catch (ex: any) {
      alert(tr("board.importFailed", { msg: ex.message }));
    }
  };

  const download = (data: string | Blob, filename: string, mime: string) => {
    const blob = typeof data === "string" ? new Blob([data], { type: mime }) : data;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportTo = (name: string, id: string) => {
    try {
      const appState: AppState = { background: themeRef.current.background, grid: showGrid };
      const data = runExporter(ctx.decls, name, id, sceneRef.current.all(), appState);
      if (data === undefined) { alert(tr("board.exportFailed", { msg: "not found" })); return; }
      const decl = ctx.decls.find((d) => d.name === name);
      const exDecl = decl?.exports?.find((e) => e.id === id);
      const ext = exDecl?.extension || "txt";
      const filename = `${meta?.name || "untitled"}.${ext}`;
      download(data, filename, exDecl?.mimeType || "application/octet-stream");
    } catch (ex: any) {
      alert(tr("board.exportFailed", { msg: ex.message }));
    }
  };

  const commands = useMemo(() => ctx.decls.flatMap((d) => d.commands || []), [ctx.decls]);

  const copyShareLink = async () => {
    await api.shareBoard(boardId, true);
    setMeta((m) => m && { ...m, shared: true });
    await navigator.clipboard.writeText(`${location.origin}/#/b/${boardId}`).catch(() => {});
  };

  const groups = useMemo(() => {
    const g = new Map<string, ToolDef[]>();
    for (const d of pluginToolDefs) {
      const arr = g.get(d.category || "") || [];
      arr.push(d); g.set(d.category || "", arr);
    }
    return [...g.entries()];
  }, [pluginToolDefs]);

  const q = libSearch.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!q) return groups;
    return groups
      .map(([cat, draws]) => {
        const matchesCat = cat.toLowerCase().includes(q);
        const matched = draws.filter((d) =>
          matchesCat ||
          d.id.toLowerCase().includes(q) ||
          d.label.toLowerCase().includes(q) ||
          (d.keywords || "").toLowerCase().includes(q),
        );
        return [cat, matched] as [string, ToolDef[]];
      })
      .filter(([, draws]) => draws.length > 0);
  }, [groups, q]);

  // Auto-expand categories that contain search matches.
  useEffect(() => {
    if (!q) {
      setOpenCats(new Set());
      return;
    }
    const matched = new Set(filteredGroups.map(([cat]) => cat));
    setOpenCats((prev) => {
      const next = new Set(prev);
      matched.forEach((c) => next.add(c));
      return next;
    });
  }, [q, filteredGroups]);

  // Which properties the right panel shows: the selection's if any element is
  // selected, otherwise the active tool's (builtin or plugin draw).
  const activeSpecs = useMemo<PropSpec[]>(() => {
    let specs: PropSpec[] = [];
    const firstSelId = [...selection][0];
    const firstSel = firstSelId ? sceneRef.current.get(firstSelId) : null;
    if (firstSel) specs = propsForEl(firstSel);
    else if (pluginTool) {
      specs = pluginToolDefs.find((t) => t.id === pluginTool.id)?.props || [];
    } else {
      specs = BUILTIN_TOOLS.find((t) => t.id === tool)?.props || [];
    }
    // layer ops only make sense with something selected
    return specs.filter((s) => typeof s !== "string" || s !== "layers" || selection.size > 0);
  }, [selection, pluginTool, tool, pluginToolDefs, tick]);

  // panel shows the selected element's values, else the tool defaults
  const panelStyle = useMemo<Style>(() => {
    const firstSelId = [...selection][0];
    const el = firstSelId ? sceneRef.current.get(firstSelId) : null;
    if (!el) return style;
    return {
      stroke: el.stroke, fill: el.fill, strokeWidth: el.strokeWidth,
      opacity: el.opacity, strokeType: el.strokeType ?? (el.dashed ? "dashed" : "solid"),
      fontSize: el.fontSize ?? 16,
      textAlign: el.textAlign ?? (el.type === "text" ? "left" : "center"),
      link: el.link,
      lineType: el.lineType ?? (el.curve ? "curve" : "sharp"),
      headStart: el.headStart ?? "none", headEnd: el.headEnd ?? "arrow",
      edges: el.edges ?? "sharp",
      fillPattern: el.fillPattern ?? "solid",
    };
  }, [selection, style, tick]);

  // z-position of the selection, e.g. "3 / 12" (range for multi-select)
  const layerInfo = useMemo(() => {
    if (!selection.size) return undefined;
    const idxs = [...selection]
      .map((id) => sceneRef.current.rankOf(id))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b);
    if (!idxs.length) return undefined;
    const total = sceneRef.current.size;
    return idxs.length === 1
      ? `${idxs[0] + 1} / ${total}`
      : `${idxs[0] + 1}–${idxs[idxs.length - 1] + 1} / ${total}`;
  }, [selection, tick]);

  const isTouch = useMemo(() => matchMedia("(pointer: coarse)").matches, []);
  const zoom = vpRef.current.zoom; // refreshed via tick
  const canUndo = useMemo(() => undoStack.current.length > 0, [tick]);
  const canRedo = useMemo(() => redoStack.current.length > 0, [tick]);

  return (
    <div className="board-page">

      {showReactions && (
        <div className="reaction-bar">
          {reactions.map((r) => (
            <button key={r.id} title={r.label}
              onClick={(e) => {
                const rect = wrapRef.current!.getBoundingClientRect();
                fireReaction(r.emoji, e.clientX - rect.left, rect.height - 160);
              }}>
              {r.emoji}
            </button>
          ))}
          {reactions.length === 0 && <span className="dim small">No reactions installed</span>}
        </div>
      )}

      <div className="editor" ref={wrapRef}>
        <div className="nav-float">
          <input type="file" ref={fileRef} style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.currentTarget.value = ""; }} />
          <button className={`menu-btn ${menuOpen ? "open" : ""}`} onClick={() => setMenuOpen((v) => !v)} title="Menu" aria-label="Menu">
            <span className="hamburger"><span></span><span></span><span></span></span>
          </button>
          {menuOpen && (
            <div className="menu-dropdown">
              <div className="menu-header">
                <span className={`dot ${online ? "on" : "off"}`} title={online ? tr("board.connected") : tr("board.offline")} />
                <input
                  className="board-title"
                  value={meta?.name ?? ""}
                  onChange={(e) => setMeta((m) => m && { ...m, name: e.target.value })}
                  placeholder={tr("board.untitled")}
                />
              </div>
              <div className="menu-sep" />
              <button className="menu-item" onClick={() => { setMenuOpen(false); location.hash = "#/boards"; }}>
                <span className="menu-item-inner"><MenuIcon d="M19 12H5M12 19l-7-7 7-7" />{tr("board.back")}</span>
              </button>
              <div className="menu-sep" />
              <div className="menu-section"><span className="dim small">{tr("board.import")}</span></div>
              {ctx.decls.flatMap((d) => (d.imports || []).map((i) => (
                <button key={`${d.name}:${i.id}`} className="menu-item" onClick={() => startImport(d.name, i.id, i.extensions)}>
                  <span className="menu-item-inner" style={{ paddingLeft: 12 }}>{i.label}</span>
                </button>
              )))}
              {ctx.decls.flatMap((d) => d.imports || []).length === 0 && (
                <span className="dim small" style={{ padding: "6px 12px", display: "block" }}>No importers installed</span>
              )}
              <div className="menu-section"><span className="dim small">{tr("board.export")}</span></div>
              {ctx.decls.flatMap((d) => (d.exports || []).map((e) => (
                <button key={`${d.name}:${e.id}`} className="menu-item" onClick={() => { setMenuOpen(false); exportTo(d.name, e.id); }}>
                  <span className="menu-item-inner" style={{ paddingLeft: 12 }}>{e.label}</span>
                </button>
              )))}
              {ctx.decls.flatMap((d) => d.exports || []).length === 0 && (
                <span className="dim small" style={{ padding: "6px 12px", display: "block" }}>No exporters installed</span>
              )}
              {commands.length > 0 && (
                <>
                  <div className="menu-sep" />
                  {commands.map((c) => (
                    <button key={c.id} className="menu-item" onClick={() => {
                      setMenuOpen(false);
                      runAction(ctx.decls, c.action, {
                        elements: () => sceneRef.current.all(),
                        replaceAll: (els: El[]) => {
                          snapshot();
                          sceneRef.current.replaceAll(els);
                          broadcastScene(); scheduleSave(); rerender();
                        },
                        alert: (msg: string) => alert(msg),
                      });
                    }}>
                      {c.label}
                    </button>
                  ))}
                </>
              )}
              <div className="menu-sep" />
              <button className={`menu-item ${showReactions ? "active" : ""}`} onClick={() => setShowReactions((v) => !v)}>
                <span className="menu-item-inner"><MenuIcon d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />{tr("board.reactions")}</span>
                {showReactions && <MenuIcon d="M20 6L9 17l-5-5" className="menu-check" />}
              </button>
              <button className={`menu-item ${showGrid ? "active" : ""}`} onClick={() => setShowGrid((v) => !v)}>
                <span className="menu-item-inner"><MenuIcon d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />{tr("board.grid")}</span>
                {showGrid && <MenuIcon d="M20 6L9 17l-5-5" className="menu-check" />}
              </button>
              <div className="menu-sep" />
              <label className="menu-row">
                <span className="dim small"><MenuIcon d="M12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zM12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />{tr("misc.theme")}</span>
                <ThemePicker ctx={ctx} />
              </label>
              <label className="menu-row">
                <span className="dim small"><MenuIcon d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />{tr("misc.language")}</span>
                <LocaleSwitcher />
              </label>
              <div className="menu-sep" />
              <button className="menu-item primary" onClick={() => { setMenuOpen(false); setShowShare(true); }}>
                <MenuIcon d="M18 8a3 3 0 1 0-3-3 3 3 0 0 0 3 3zM6 15a3 3 0 1 0-3-3 3 3 0 0 0 3 3zM18 21a3 3 0 1 0-3 3 3 3 0 0 0 3-3zM8.59 13.51l6.83-3.98M15.41 10.49l-6.82-3.98" />{tr("board.share")}
              </button>
            </div>
          )}
        </div>
        {(peers.length > 0 || groups.length > 0) && (
          <div className="peers-float">
            {peers.map((p) => (
              <span key={p.id} className="peer" style={{ background: colorFor(p.id) }} title={p.name}>
                {p.name.slice(0, 2).toUpperCase()}
              </span>
            ))}
            {groups.length > 0 && (
              <button
                className={`lib-panel-toggle ${showLibPanel ? "active" : ""}`}
                onClick={() => setShowLibPanel((v) => !v)}
                title={showLibPanel ? "Hide library" : "Show library"}
                aria-label={showLibPanel ? "Hide library" : "Show library"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="9" height="9" rx="1.5" />
                  <circle cx="17" cy="16" r="4" />
                </svg>
              </button>
            )}
          </div>
        )}

        <canvas
          ref={canvasRef}
          className={`board-canvas tool-${tool} ${panning ? "panning" : ""}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDblClick}
          onClick={(e) => {
            if (showReactions && (e.metaKey || e.altKey)) {
              const rect = wrapRef.current!.getBoundingClientRect();
              fireReaction(reactions[0]?.emoji || "👍", e.clientX - rect.left, e.clientY - rect.top);
              return;
            }
            if ((e.ctrlKey || e.metaKey) && tool === "select" && !pluginTool) {
              const { x: wx, y: wy } = toWorld(e);
              const hit = sceneRef.current.hitTest(wx, wy, 10 / vpRef.current.zoom);
              if (hit?.link) {
                e.preventDefault();
                window.open(hit.link, "_blank", "noopener,noreferrer");
              }
            }
          }}
        />

        {linkBubble && (
          <a
            className="link-bubble"
            href={linkBubble.url}
            target="_blank"
            rel="noreferrer"
            title={linkBubble.url}
            style={{ left: linkBubble.x, top: linkBubble.y }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="link-bubble-icon">↗</span>
            <span className="link-bubble-url">{linkBubble.url}</span>
          </a>
        )}

        <div className="toolbar">
          {BUILTIN_TOOLS.map((t) => (
            <button key={t.id} title={tr(t.label)}
              className={tool === t.id && !pluginTool ? "active" : ""}
              onClick={() => { setTool(t.id as Tool); setPluginTool(null); }}>
              {t.icon}
              {t.hotkey && <kbd className="tool-key">{t.hotkey}</kbd>}
            </button>
          ))}
          <div className="tb-sep" />
          <button onClick={undo} title={tr("board.undo")} disabled={!canUndo}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 14 4 9 9 4" />
              <path d="M4 9h10a6 6 0 0 1 6 6v0a6 6 0 0 1-6 6h-3" />
            </svg>
          </button>
          <button onClick={redo} title={tr("board.redo")} disabled={!canRedo}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 14 20 9 15 4" />
              <path d="M20 9h-10a6 6 0 0 0 -6 6v0a6 6 0 0 0 6 6h3" />
            </svg>
          </button>
          {isTouch && (
            <button className={showStyleBar ? "active" : ""} onClick={() => setShowStyleBar((v) => !v)} title={tr("board.styles")}>🎨</button>
          )}
        </div>

        {groups.length > 0 && (
          <div className={`lib-panel-wrap ${showLibPanel ? "open" : "collapsed"}`}>
            <div className="lib-panel">
              <Tooltip id="lib-tooltip" place="left" />
              <div className="lib-search">
                <SearchIcon size={14} />
                <input
                  type="text"
                  value={libSearch}
                  onChange={(e) => setLibSearch(e.target.value)}
                  placeholder={tr("lib.search")}
                />
                {q && (
                  <button className="lib-search-clear" onClick={() => setLibSearch("")} data-tooltip-id="lib-tooltip" data-tooltip-content={tr("boards.cancel")}>
                    ✕
                  </button>
                )}
              </div>
              {filteredGroups.length === 0 && (
                <div className="dim small" style={{ marginTop: 8 }}>{tr("lib.noResults", { q: libSearch.trim() })}</div>
              )}
              {filteredGroups.map(([cat, draws]) => {
                const open = openCats.has(cat);
                return (
                  <div key={cat} className={`lib-section ${open ? "open" : ""}`}>
                    <button
                      className="lib-accordion-head"
                      data-tooltip-id="lib-tooltip"
                      data-tooltip-content={cat}
                      onClick={() => setOpenCats((prev) => {
                        const next = new Set(prev);
                        if (next.has(cat)) next.delete(cat);
                        else next.add(cat);
                        return next;
                      })}
                    >
                      <span>{cat}</span>
                      <ChevronDownIcon size={14} className="lib-chevron" />
                    </button>
                    <div className="lib-grid">
                      {draws.map((d) => (
                        <button
                          key={d.id}
                          data-tooltip-id="lib-tooltip"
                          data-tooltip-content={d.tooltip || d.label}
                          className={pluginTool?.id === d.id ? "active" : ""}
                          onClick={() => setPluginTool(
                            pluginTool?.id === d.id ? null : pluginDraws.find((p) => p.id === d.id)!,
                          )}
                        >
                          {d.icon}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              <button className="lib-add-extensions" onClick={() => setShowShapePlugins(true)} data-tooltip-id="lib-tooltip" data-tooltip-content={tr("lib.addExtensions")}>
                {tr("lib.addExtensions")}
              </button>
            </div>
          </div>
        )}

        {showShapePlugins && (
          <PluginsPanel ctx={ctx} forShapes onClose={() => setShowShapePlugins(false)} />
        )}

        {showStyleBar && activeSpecs.length > 0 && (
          <PropsPanel
            specs={activeSpecs}
            style={panelStyle}
            theme={theme}
            hasSelection={selection.size > 0}
            layerInfo={layerInfo}
            canGroup={selection.size > 1}
            canUngroup={[...selection].some((id) => sceneRef.current.get(id)?.groupId)}
            tr={tr}
            onStyle={applyStyle}
            onLayer={applyLayer}
            onGroup={groupSelection}
            onUngroup={ungroupSelection}
          />
        )}

        {textEdit && (
          <textarea
            autoFocus
            rows={Math.max(1, (textEdit.value.match(/\n/g) || []).length + 1)}
            onFocus={(e) => { const len = e.currentTarget.value.length; e.currentTarget.setSelectionRange(len, len); }}
            className="text-editor"
            style={{
              left: (textEdit.x - vpRef.current.x) * vpRef.current.zoom,
              top: (textEdit.y - vpRef.current.y) * vpRef.current.zoom,
              fontSize: (textEdit.align === "center" || textEdit.multiline ? 16 : 20) * vpRef.current.zoom,
              transform: textEdit.align === "left" ? "translate(0, -50%)" : textEdit.align === "right" ? "translate(-100%, -50%)" : "translate(-50%, -50%)",
              textAlign: textEdit.align ?? "center",
              ...(textEdit.width !== undefined ? { width: textEdit.width * vpRef.current.zoom, boxSizing: "border-box" } : {}),
            }}
            value={textEdit.value}
            onChange={(e) => setTextEdit({ ...textEdit, value: e.target.value })}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setTextEdit(null); return; }
              if (e.key === "Enter" && !textEdit.multiline && !e.shiftKey) { e.preventDefault(); commitText(); return; }
              e.stopPropagation();
            }}
          />
        )}

        {toast && <div className="hint toast">{toast}</div>}

        {pluginTool && (
          <div className="hint">{tr("board.placeHint", { label: pluginTool.label })}</div>
        )}

        <div className="bottom-float">
          <div className="zoom-controls">
            <span className="dim small">{Math.round(zoom * 100)}%</span>
            <button onClick={() => { vpRef.current.zoom = Math.max(0.1, vpRef.current.zoom / 1.5); rerender(); }}>−</button>
            <button onClick={() => { vpRef.current.zoom = Math.min(6, vpRef.current.zoom * 1.5); rerender(); }}>＋</button>
            <button onClick={() => {
              const b = sceneRef.current.sceneBounds();
              const r = wrapRef.current!.getBoundingClientRect();
              vpRef.current.zoom = Math.min(2, Math.min(r.width / (b.x1 - b.x0 + 200), r.height / (b.y1 - b.y0 + 200)));
              vpRef.current.x = (b.x0 + b.x1) / 2 - r.width / vpRef.current.zoom / 2;
              vpRef.current.y = (b.y0 + b.y1) / 2 - r.height / vpRef.current.zoom / 2;
              rerender();
            }} title={tr("board.zoomFit")}>⛶</button>
          </div>
          <div className={`minimap-wrap ${showMinimap ? "open" : "collapsed"}`}>
            <Minimap scene={sceneRef.current} vp={vpRef.current} theme={theme}
              cssW={size.w} cssH={size.h}
              onJump={(wx, wy) => {
                vpRef.current.x = wx - size.w / vpRef.current.zoom / 2;
                vpRef.current.y = wy - size.h / vpRef.current.zoom / 2;
                rerender();
              }} />
            <button
              className="minimap-toggle"
              onClick={() => setShowMinimap((v) => !v)}
              title={tr("board.minimap")}
            >
              {showMinimap ? "−" : "🗺️"}
            </button>
          </div>
        </div>

        <ReactionLayer floats={floats} />
      </div>

      {showShare && (
        <div className="modal-backdrop" onClick={() => setShowShare(false)}>
          <div className="modal small-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h3>{tr("share.title")}</h3><button onClick={() => setShowShare(false)}>✕</button></div>
            <p className="dim small">
              {tr("share.desc")}
            </p>
            <div className="row">
              <label>
                <input type="checkbox" checked={!!meta?.shared}
                  onChange={async (e) => {
                    await api.shareBoard(boardId, e.target.checked);
                    setMeta((m) => m && { ...m, shared: e.target.checked });
                  }} /> {tr("share.anyone")}
              </label>
            </div>
            <button className="primary" onClick={copyShareLink}>{tr("share.copy")}</button>
            {meta?.shared && (
              <p className="small dim selectable">{`${location.origin}/#/b/${boardId}`}</p>
            )}
          </div>
        </div>
      )}
      {getToken() === "" && <div className="hint">{tr("board.guest")}</div>}
    </div>
  );
}
