// Board page: the canvas editor. High-performance rendering (spatial grid
// culling, rAF-coalesced draws), full toolset, styles, themes, minimap,
// realtime collaboration, reactions, plugin draws, mobile touch support.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, getToken } from "../api";
import type { AppCtx } from "../App";
import { Scene, elBounds, elMidpoint, snapKeyPoints, snapPoint } from "../canvas/scene";
import { Renderer, colorFor, handles, type Cursor } from "../canvas/renderer";
import { CollabClient, type WireMsg } from "../collab";
import type { BoardFull, CanvasTheme, DrawDecl, El } from "../types";
import { uid } from "../types";
import Minimap from "../components/Minimap";
import ReactionLayer, { useReactionLayer } from "../components/ReactionLayer";
import ThemePicker from "../components/ThemePicker";
import { afterPlace, allImporters, drawPropOverride, runAction } from "../integrations";
import { useT } from "../i18n";
import LocaleSwitcher from "../components/LocaleSwitcher";
import { cloneForPaste, parseElements, serializeElements } from "../clipboard";
import PropsPanel from "../components/PropsPanel";
import {
  BUILTIN_TOOLS, drawToToolDef, propsForEl,
  type LayerOp, type PropSpec, type Style, type ToolDef,
} from "../tools";

type Tool =
  | "select" | "rect" | "ellipse" | "diamond"
  | "line" | "arrow" | "freedraw" | "text" | "eraser";

// Letter hotkeys, plus number hotkeys derived from the tool definitions
// (Excalidraw layout: 1 select, 2 rect, 3 diamond, 4 ellipse, 5 arrow,
// 6 line, 7 freedraw, 8 text, 0 eraser).
const TOOL_KEYS: Record<string, Tool> = {
  v: "select", r: "rect", e: "ellipse", d: "diamond",
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
    lineType: "curve", headStart: "none", headEnd: "arrow", edges: "sharp",
  });
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<El | null>(null);
  const [cursors, setCursors] = useState<Cursor[]>([]);
  const [peers, setPeers] = useState<{ id: string; name: string }[]>([]);
  const [online, setOnline] = useState(false);
  const [themeId, setThemeId] = useState(localStorage.getItem("drawboard.theme") || "light");
  const [showMinimap, setShowMinimap] = useState(true);
  const [showReactions, setShowReactions] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showStyleBar, setShowStyleBar] = useState(true);
  const [size, setSize] = useState({ w: innerWidth, h: innerHeight });
  const [textEdit, setTextEdit] = useState<{ id: string | null; x: number; y: number; value: string; center?: boolean } | null>(null);
  const [tick, setTick] = useState(0); // force minimap repaint trigger

  const { floats, spawn } = useReactionLayer();
  const selectionRef = useRef(selection); selectionRef.current = selection;
  const styleRef = useRef(style); styleRef.current = style;
  const theme: CanvasTheme = useMemo(
    () => (ctx.themes.find((t) => t.id === themeId) || ctx.themes[0]).canvas,
    [ctx.themes, themeId],
  );
  const themeRef = useRef(theme); themeRef.current = theme;

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
      api.saveBoard(boardId, sceneRef.current.all(), { theme: themeRef.current.background }).catch(() => {});
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
      rerender();
    }).catch((e) => alert(e.message));
    const client = new CollabClient(boardId, handleWire, setOnline);
    collabRef.current = client;
    return () => { disposed = true; client.close(); clearTimeout(saveTimer.current); };
  }, [boardId, handleWire, rerender]);

  // --- renderer lifecycle ---
  useEffect(() => {
    const canvas = canvasRef.current!, wrap = wrapRef.current!;
    const r = new Renderer(canvas, sceneRef.current, vpRef.current, themeRef.current,
      () => ({ selection: selectionRef.current, draft: draftRef.current, cursors: cursorsRef.current, editingId: textEditRef.current?.id ?? null, snapHints: snapHintsRef.current }));
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

  // hide the element's canvas text while its editor is open
  useEffect(() => { rerender(); }, [textEdit, rerender]);

  // selection boxes are canvas-drawn — repaint whenever the selection changes
  useEffect(() => { rerender(); }, [selection, rerender]);

  useEffect(() => {
    const onTheme = (e: Event) => setThemeId((e as CustomEvent).detail);
    addEventListener("themechange", onTheme);
    return () => removeEventListener("themechange", onTheme);
  }, []);

  const draftRef = useRef(draft); draftRef.current = draft;
  const cursorsRef = useRef(cursors); cursorsRef.current = cursors;
  const textEditRef = useRef(textEdit); textEditRef.current = textEdit;
  const snapHintsRef = useRef<{ x: number; y: number }[]>([]);

  // --- interaction state machine ---
  const gesture = useRef<{
    mode: "none" | "draw" | "move" | "resize" | "point" | "label" | "pan" | "maybe";
    startWX: number; startWY: number; orig: Map<string, El>;
    pointerId: number; moved: boolean; handle: number;
    pendingToggle: string | null; // shift+click multi-select candidate
  }>({ mode: "none", startWX: 0, startWY: 0, orig: new Map(), pointerId: -1, moved: false, handle: -1, pendingToggle: null });

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
    lineType: styleRef.current.lineType,
    headStart: styleRef.current.headStart, headEnd: styleRef.current.headEnd,
    edges: styleRef.current.edges,
    roughness: themeRef.current.roughness,
    seed: Math.floor(Math.random() * 2 ** 31), updatedAt: Date.now(), ...extra,
  });

  const commitEl = (el: El) => {
    el.updatedAt = Date.now();
    sceneRef.current.upsert(el);
    broadcastOp({ kind: "upsert", el });
    scheduleSave();
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

    const pan = e.button === 1 || (e.shiftKey && tool === "select" && !pluginTool);
    if (pan) {
      g.mode = "pan";
      // shift+click (no drag) toggles multi-select; shift+drag still pans
      g.pendingToggle = null;
      if (e.shiftKey && e.button !== 1) {
        const hit = sceneRef.current.hitTest(wx, wy, 10 / vpRef.current.zoom);
        if (hit) g.pendingToggle = hit.id;
      }
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
      // handle interactions (vertex/label/resize) only for a single selection —
      // otherwise their zones eat clicks meant for other elements
      const th = 8 / vpRef.current.zoom;
      for (const id of selectionRef.current.size === 1 ? selectionRef.current : []) {
        let el = sceneRef.current.get(id);
        if (!el || (el.type !== "line" && el.type !== "arrow") || !el.points) continue;
        if (el.points.length === 4) {
          // migrate 2-point lines to 3 points (start/middle/end)
          const [x0, y0, x1, y1] = el.points;
          el = { ...el, points: [x0, y0, (x0 + x1) / 2, (y0 + y1) / 2, x1, y1], updatedAt: Date.now() };
          sceneRef.current.upsert(el);
        }
        const pts = el.points!;
        const vi: number[] = [];
        for (let i = 0; i + 1 < pts.length; i += 2) vi.push(i);
        const hitVi = vi.find((i) =>
          Math.abs(wx - (el!.x + pts[i])) <= th && Math.abs(wy - (el!.y + pts[i + 1])) <= th);
        if (hitVi !== undefined) {
          snapshot();
          g.mode = "point";
          g.handle = hitVi;
          g.orig.set(id, { ...el, points: [...pts] });
          return;
        }
        if (el.text) {
          const m = elMidpoint(el);
          const ax = m.x + (el.labelDx || 0), ay = m.y + (el.labelDy || 0);
          const fs = el.fontSize || 16;
          const lines = el.text.split("\n");
          const hw = Math.max(...lines.map((l) => l.length), 1) * fs * 0.3 + th;
          const hh = (lines.length * fs * 1.3) / 2 + th;
          if (Math.abs(wx - ax) <= hw && Math.abs(wy - ay) <= hh) {
            snapshot();
            g.mode = "label";
            g.orig.set(id, { ...el, points: [...pts] });
            return;
          }
        }
      }
      // resize handles of the current selection take priority
      for (const id of selectionRef.current.size === 1 ? selectionRef.current : []) {
        const el = sceneRef.current.get(id);
        if (!el || !["rect", "ellipse", "diamond", "icon", "shape"].includes(el.type)) continue;
        const hs = handles(elBounds(el));
        const hi = hs.findIndex(([hx, hy]) => Math.abs(wx - hx) <= th && Math.abs(wy - hy) <= th);
        if (hi >= 0) {
          snapshot();
          g.mode = "resize";
          g.handle = hi;
          g.orig.set(id, { ...el });
          return;
        }
      }
      const hit = sceneRef.current.hitTest(wx, wy, 10 / vpRef.current.zoom);
      if (hit && selectionRef.current.has(hit.id)) {
        g.mode = "move";
        for (const id of selectionRef.current) {
          const el = sceneRef.current.get(id);
          if (el) g.orig.set(id, { ...el, points: el.points ? [...el.points] : undefined });
        }
      } else if (hit) {
        setSelection(new Set([hit.id]));
        g.mode = "move";
        g.orig.set(hit.id, { ...hit, points: hit.points ? [...hit.points] : undefined });
      } else {
        // empty space: click clears the selection, drag pans the canvas
        setSelection(new Set());
        g.mode = "pan";
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
    if (g.mode === "resize") {
      const [id, orig] = [...g.orig.entries()][0];
      // handles: 0 TL, 1 T, 2 TR, 3 R, 4 BR, 5 B, 6 BL, 7 L
      const ox0 = Math.min(orig.x, orig.x + orig.w), ox1 = Math.max(orig.x, orig.x + orig.w);
      const oy0 = Math.min(orig.y, orig.y + orig.h), oy1 = Math.max(orig.y, orig.y + orig.h);
      let x0 = ox0, x1 = ox1, y0 = oy0, y1 = oy1;
      if ([0, 6, 7].includes(g.handle)) x0 = wx;
      if ([2, 3, 4].includes(g.handle)) x1 = wx;
      if ([0, 1, 2].includes(g.handle)) y0 = wy;
      if ([4, 5, 6].includes(g.handle)) y1 = wy;
      if (e.shiftKey) {
        // keep aspect ratio, anchored at the opposite corner/edge
        const ow = Math.max(1, ox1 - ox0), oh = Math.max(1, oy1 - oy0);
        const s = Math.max(Math.abs(x1 - x0) / ow, Math.abs(y1 - y0) / oh);
        const nw = ow * s, nh = oh * s;
        if ([2, 3, 4].includes(g.handle)) x1 = ox0 + nw; else if ([0, 6, 7].includes(g.handle)) x0 = ox1 - nw;
        else { x0 = (ox0 + ox1) / 2 - nw / 2; x1 = x0 + nw; }
        if ([4, 5, 6].includes(g.handle)) y1 = oy0 + nh; else if ([0, 1, 2].includes(g.handle)) y0 = oy1 - nh;
        else { y0 = (oy0 + oy1) / 2 - nh / 2; y1 = y0 + nh; }
      }
      const el = {
        ...orig,
        x: Math.min(x0, x1), y: Math.min(y0, y1),
        w: Math.max(4, Math.abs(x1 - x0)), h: Math.max(4, Math.abs(y1 - y0)),
        updatedAt: Date.now(),
      };
      sceneRef.current.upsert(el);
      updateBoundArrows(el);
      rerender();
      return;
    }
    if (g.mode === "point") {
      const [id, orig] = [...g.orig.entries()][0];
      const pts = [...(orig.points || [])];
      let px = wx, py = wy;
      const upd = { ...orig, points: pts, updatedAt: Date.now() };
      const isEndpoint = g.handle === 0 || g.handle === pts.length - 2;
      if (isEndpoint && orig.type === "arrow") {
        // show the magnetic points of nearby shapes while dragging
        const R = 24 / vpRef.current.zoom;
        snapHintsRef.current = sceneRef.current
          .query(wx - R, wy - R, wx + R, wy + R)
          .filter((el) => el.id !== id)
          .flatMap((el) => snapKeyPoints(el).map(([x, y]) => ({ x, y })));
        const s = snapPoint(sceneRef.current, wx, wy, id, 12 / vpRef.current.zoom, 6 / vpRef.current.zoom);
        if (s) {
          px = s.x; py = s.y;
          const shape = sceneRef.current.get(s.id);
          if (shape) {
            // fractional position within the shape's bbox — survives move/resize
            const x0 = Math.min(shape.x, shape.x + shape.w), x1 = Math.max(shape.x, shape.x + shape.w);
            const y0 = Math.min(shape.y, shape.y + shape.h), y1 = Math.max(shape.y, shape.y + shape.h);
            const b = { id: s.id, fx: (px - x0) / (x1 - x0 || 1), fy: (py - y0) / (y1 - y0 || 1) };
            if (g.handle === 0) upd.bindStart = b; else upd.bindEnd = b;
          }
        } else {
          // dragged away from any shape — detach this endpoint
          if (g.handle === 0) delete upd.bindStart; else delete upd.bindEnd;
        }
      } else {
        snapHintsRef.current = [];
      }
      pts[g.handle] = px - orig.x;
      pts[g.handle + 1] = py - orig.y;
      sceneRef.current.upsert(upd);
      rerender();
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
    if (snapHintsRef.current.length) { snapHintsRef.current = []; rerender(); }

    // shift+click without dragging: toggle the element in the selection
    if (g.mode === "pan" && !g.moved && g.pendingToggle) {
      const id = g.pendingToggle;
      setSelection((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id); else n.add(id);
        return n;
      });
    }
    g.pendingToggle = null;

    if ((g.mode === "move" || g.mode === "resize" || g.mode === "point" || g.mode === "label") && g.moved) {
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
      scheduleSave();
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

  // double-click → edit text (on shapes: centered; on empty space: create)
  const onDblClick = (e: React.MouseEvent) => {
    const { x: wx, y: wy } = toWorld(e);
    const hit = sceneRef.current.hitTest(wx, wy, 10 / vpRef.current.zoom);
    if (hit && (hit.type === "line" || hit.type === "arrow")) {
      const m = elMidpoint(hit);
      setTextEdit({
        id: hit.id, x: m.x + (hit.labelDx || 0), y: m.y + (hit.labelDy || 0),
        value: hit.text || "", center: true,
      });
    } else if (hit && ["text", "shape", "rect", "ellipse", "diamond"].includes(hit.type)) {
      if (hit.type === "text") {
        setTextEdit({ id: hit.id, x: hit.x, y: hit.y, value: hit.text || "" });
      } else {
        const b = elBounds(hit);
        setTextEdit({
          id: hit.id, x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2,
          value: hit.text || "", center: true,
        });
      }
    } else if (!hit) {
      const el = makeEl("text", wx, wy, { text: "", w: 200, h: 28 });
      setTextEdit({ id: el.id, x: wx, y: wy, value: "" });
    }
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
      const upd = { ...existing, text: textEdit.value };
      if (existing.type === "line" || existing.type === "arrow") {
        // keep the label offset relative to the midpoint
        const m = elMidpoint(existing);
        upd.labelDx = textEdit.x - m.x;
        upd.labelDy = textEdit.y - m.y;
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

  const pasteFromClipboard = async () => {
    let text = "";
    try { text = await navigator.clipboard.readText(); } catch { /* permission */ }
    if (!text) text = internalClip.current;
    const els = parseElements(text);
    if (!els || !els.length) { if (text) flash(tr("board.pasteFailed")); return; }
    const vp = vpRef.current, rect = wrapRef.current!.getBoundingClientRect();
    const target = lastPointer.current.x || lastPointer.current.y
      ? lastPointer.current
      : { x: vp.x + rect.width / vp.zoom / 2, y: vp.y + rect.height / vp.zoom / 2 };
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
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        e.preventDefault();
        pasteFromClipboard();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }
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

  // draw.io import (provided by integration web logic — see uml-shapes).
  const importFile = async (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase() || "";
    const imp = allImporters(ctx.decls).find((i) => i.extensions.includes(ext));
    if (!imp) { alert(tr("board.noImporter", { ext })); return; }
    try {
      const els = imp.run(await f.text());
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
      scheduleSave(); rerender();
    } catch (ex: any) {
      alert(tr("board.importFailed", { msg: ex.message }));
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
      lineType: el.lineType ?? (el.curve ? "curve" : "sharp"),
      headStart: el.headStart ?? "none", headEnd: el.headEnd ?? "arrow",
      edges: el.edges ?? "sharp",
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

  return (
    <div className="board-page">
      <header className="topbar">
        <button onClick={() => (location.hash = "#/boards")} title={tr("board.back")}>←</button>
        <input
          className="board-title"
          value={meta?.name ?? ""}
          onChange={(e) => setMeta((m) => m && { ...m, name: e.target.value })}
          placeholder={tr("board.untitled")}
        />
        <span className={`dot ${online ? "on" : "off"}`} title={online ? tr("board.connected") : tr("board.offline")} />
        {peers.map((p) => (
          <span key={p.id} className="peer" style={{ background: colorFor(p.id) }} title={p.name}>
            {p.name.slice(0, 2).toUpperCase()}
          </span>
        ))}
        <div className="spacer" />
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
        <button className={showReactions ? "active" : ""} onClick={() => setShowReactions((v) => !v)} title={tr("board.reactions")}>😀</button>
        <button className={showMinimap ? "active" : ""} onClick={() => setShowMinimap((v) => !v)} title={tr("board.minimap")}>🗺️</button>
        <ThemePicker ctx={ctx} />
        <button className="primary" onClick={() => setShowShare(true)}>{tr("board.share")}</button>
      </header>

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
        <canvas
          ref={canvasRef}
          className={`board-canvas tool-${tool}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDblClick}
          onClick={(e) => {
            if (showReactions && (e.metaKey || e.altKey)) {
              const rect = wrapRef.current!.getBoundingClientRect();
              fireReaction(reactions[0]?.emoji || "👍", e.clientX - rect.left, e.clientY - rect.top);
            }
          }}
        />

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
          <button onClick={undo} title={tr("board.undo")}>↶</button>
          <button onClick={redo} title={tr("board.redo")}>↷</button>
          {isTouch && (
            <button className={showStyleBar ? "active" : ""} onClick={() => setShowStyleBar((v) => !v)} title={tr("board.styles")}>🎨</button>
          )}
        </div>

        {groups.length > 0 && (
          <div className="lib-panel">
            {groups.map(([cat, draws]) => (
              <div key={cat}>
                <div className="lib-cat">{cat}</div>
                <div className="lib-grid">
                  {draws.map((d) => (
                    <button key={d.id} title={d.label}
                      className={pluginTool?.id === d.id ? "active" : ""}
                      onClick={() => setPluginTool(
                        pluginTool?.id === d.id ? null : pluginDraws.find((p) => p.id === d.id)!,
                      )}>
                      {d.icon}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {showStyleBar && activeSpecs.length > 0 && (
          <PropsPanel
            specs={activeSpecs}
            style={panelStyle}
            theme={theme}
            hasSelection={selection.size > 0}
            layerInfo={layerInfo}
            tr={tr}
            onStyle={applyStyle}
            onLayer={applyLayer}
          />
        )}

        {textEdit && (
          <textarea
            autoFocus
            rows={1}
            onFocus={(e) => { const len = e.currentTarget.value.length; e.currentTarget.setSelectionRange(len, len); }}
            className="text-editor"
            style={{
              left: (textEdit.x - vpRef.current.x) * vpRef.current.zoom,
              top: (textEdit.y - vpRef.current.y) * vpRef.current.zoom,
              fontSize: (textEdit.center ? 16 : 20) * vpRef.current.zoom,
              ...(textEdit.center ? { transform: "translate(-50%, -50%)", textAlign: "center" as const } : {}),
            }}
            value={textEdit.value}
            onChange={(e) => setTextEdit({ ...textEdit, value: e.target.value })}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === "Escape") setTextEdit(null);
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitText(); }
              e.stopPropagation();
            }}
          />
        )}

        {toast && <div className="hint toast">{toast}</div>}

        {pluginTool && (
          <div className="hint">{tr("board.placeHint", { label: pluginTool.label })}</div>
        )}

        {showMinimap && (
          <Minimap scene={sceneRef.current} vp={vpRef.current} theme={theme}
            cssW={size.w} cssH={size.h}
            onJump={(wx, wy) => {
              vpRef.current.x = wx - size.w / vpRef.current.zoom / 2;
              vpRef.current.y = wy - size.h / vpRef.current.zoom / 2;
              rerender();
            }} />
        )}

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
