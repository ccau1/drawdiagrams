// Right-hand properties panel. Renders whatever the active tool (or the
// selected element) declares in its PropSpec[] — built-in rows by name, or
// custom renderers supplied by integrations.
import type { CanvasTheme, EdgeKind, FillPattern, HeadType, LineKind, StrokeType } from "../types";
import type { BuiltinProp, LayerOp, PropRenderCtx, PropSpec, Style } from "../tools";

const WIDTHS = [1, 2, 4, 8];
const FONT_SIZES: [number, string][] = [[12, "S"], [16, "M"], [20, "L"], [28, "XL"]];
const LAYER_OPS: [LayerOp, string, string][] = [
  ["top", "⤒", "layer.top"], ["up", "↑", "layer.up"],
  ["down", "↓", "layer.down"], ["bottom", "⤓", "layer.bottom"],
];
const HEAD_OPTS: HeadType[] = ["none", "arrow", "triangle", "dot"];
const STROKE_TYPE_OPTS: StrokeType[] = ["solid", "dashed", "dotted"];
const LINE_TYPE_OPTS: LineKind[] = ["sharp", "curve", "elbow"];
const EDGE_OPTS: EdgeKind[] = ["sharp", "round"];
const FILL_PATTERN_OPTS: FillPattern[] = ["solid", "hatch", "crosshatch"];
const TEXT_ALIGN_OPTS: ("left" | "center" | "right")[] = ["left", "center", "right"];

function textAlignIcon(a: "left" | "center" | "right") {
  return (
    <svg width="24" height="12" viewBox="0 0 24 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      {a === "left" && (
        <><line x1="2" y1="2" x2="14" y2="2" /><line x1="2" y1="6" x2="18" y2="6" /><line x1="2" y1="10" x2="12" y2="10" /></>
      )}
      {a === "center" && (
        <><line x1="5" y1="2" x2="19" y2="2" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="6" y1="10" x2="18" y2="10" /></>
      )}
      {a === "right" && (
        <><line x1="10" y1="2" x2="22" y2="2" /><line x1="6" y1="6" x2="22" y2="6" /><line x1="12" y1="10" x2="22" y2="10" /></>
      )}
    </svg>
  );
}

/** Corner icon for the edges property: solid top-left corner, dotted rest. */
function edgeIcon(k: EdgeKind) {
  return (
    <svg width="24" height="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none">
      {k === "sharp"
        ? <path d="M5 13 V3 H15" />
        : <path d="M5 13 V8 Q5 3 10 3 H15" />}
      <path d="M15 3 H19 V13 H5" strokeDasharray="2 2.5" />
    </svg>
  );
}

/** Small icons for stroke type / line type options. */
function strokeTypeIcon(t: StrokeType) {
  return (
    <svg width="24" height="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="2" y1="6" x2="22" y2="6"
        strokeDasharray={t === "dashed" ? "5 3" : t === "dotted" ? "0.1 3.5" : undefined} />
    </svg>
  );
}
function lineTypeIcon(t: LineKind) {
  return (
    <svg width="24" height="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none">
      {t === "sharp" && <path d="M3 9 L12 3 L21 9" />}
      {t === "curve" && <path d="M3 9 Q12 -3 21 9" />}
      {t === "elbow" && <path d="M3 9 L12 9 L12 3 L21 3" />}
    </svg>
  );
}

/** Small icon for a head type; `atStart` mirrors it for the start point. */
function headIcon(type: HeadType, atStart: boolean) {
  const head =
    type === "arrow" ? <path d="M21 6 L14 2.5 M21 6 L14 9.5" fill="none" /> :
    type === "triangle" ? <polygon points="21,6 13,2 13,10" fill="currentColor" stroke="none" /> :
    type === "dot" ? <circle cx="16" cy="6" r="3" fill="currentColor" stroke="none" /> : null;
  return (
    <svg width="24" height="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
      style={atStart ? { transform: "scaleX(-1)" } : undefined}>
      <line x1="2" y1="6" x2="21" y2="6" />
      {type === "none" && <path d="M15 3 L21 9 M21 3 L15 9" />}
      {head}
    </svg>
  );
}

/** Icon for a fill pattern: solid shows the current fill color, hatch/crosshatch are line patterns. */
function fillPatternIcon(p: FillPattern, style: Style) {
  if (p === "hatch") {
    return (
      <svg width="20" height="14" viewBox="0 0 20 14" stroke="currentColor" strokeWidth="1.5" fill="none">
        <path d="M0 14 L14 0 M4 14 L18 0" />
      </svg>
    );
  }
  if (p === "crosshatch") {
    return (
      <svg width="20" height="14" viewBox="0 0 20 14" stroke="currentColor" strokeWidth="1.5" fill="none">
        <path d="M0 14 L14 0 M4 14 L18 0 M0 0 L14 14 M4 0 L18 14" />
      </svg>
    );
  }
  const fill = style.fill === "transparent" ? "#fff" : style.fill;
  return (
    <svg width="20" height="14" viewBox="0 0 20 14">
      <rect x="1" y="1" width="18" height="12" rx="2" fill={fill} stroke="currentColor" />
    </svg>
  );
}

interface Props {
  specs: PropSpec[];
  style: Style;
  theme: CanvasTheme;
  hasSelection: boolean;
  layerInfo?: string;   // e.g. "3 / 12" or "2–4 / 12" for multi-select
  tr: PropRenderCtx["tr"];
  onStyle: (patch: Partial<Style>) => void;
  onLayer: (op: LayerOp) => void;
}

export default function PropsPanel({ specs, style, theme, hasSelection, layerInfo, tr, onStyle, onLayer }: Props) {
  const ctx: PropRenderCtx = { style, hasSelection, apply: onStyle, applyLayer: onLayer, tr };

  const builtin = (spec: BuiltinProp) => {
    switch (spec) {
      case "stroke":
        return (
          <label className="dim small">{tr("style.strokeColor")}
            <div className="swatches">
              {theme.palette.map((c) => (
                <button key={c} className={`swatch ${style.stroke === c ? "active" : ""}`}
                  style={{ background: c }} title={tr("style.stroke", { c })}
                  onClick={() => onStyle({ stroke: c })} />
              ))}
              <input type="color" value={style.stroke} title={tr("style.customStroke")}
                onChange={(e) => onStyle({ stroke: e.target.value })} />
            </div>
          </label>
        );
      case "fill":
        return (
          <label className="dim small">{tr("style.fillColor")}
            <div className="swatches">
              <button className={`swatch fill-none ${style.fill === "transparent" ? "active" : ""}`}
                title={tr("style.noFill")} onClick={() => onStyle({ fill: "transparent" })}>∅</button>
              {theme.palette.slice(1).map((c) => (
                <button key={c} className={`swatch ${style.fill === c ? "active" : ""}`}
                  style={{ background: c }} title={tr("style.fill", { c })}
                  onClick={() => onStyle({ fill: c })} />
              ))}
            </div>
          </label>
        );
      case "fillPattern":
        return (
          <label className="dim small">{tr("style.fillPattern")}
            <div className="opt-row">
              {FILL_PATTERN_OPTS.map((p) => (
                <button key={p} className={style.fillPattern === p ? "active" : ""}
                  title={tr(`fillPattern.${p}`)} onClick={() => onStyle({ fillPattern: p })}>
                  {fillPatternIcon(p, style)}
                </button>
              ))}
            </div>
          </label>
        );
      case "strokeWidth":
        return (
          <label className="dim small">{tr("style.width")}
            <div className="opt-row">
              {WIDTHS.map((w) => (
                <button key={w} className={style.strokeWidth === w ? "active" : ""}
                  title={`${w}px`} onClick={() => onStyle({ strokeWidth: w })}>
                  <svg width="28" height="12"><line x1="2" y1="6" x2="26" y2="6"
                    stroke="currentColor" strokeWidth={Math.min(w, 8)} strokeLinecap="round" /></svg>
                </button>
              ))}
            </div>
          </label>
        );
      case "opacity":
        return (
          <label className="dim small">{tr("style.opacity")}
            <input type="range" min={10} max={100} value={style.opacity * 100}
              onChange={(e) => onStyle({ opacity: +e.target.value / 100 })} />
          </label>
        );
      case "strokeType":
        return (
          <label className="dim small">{tr("style.strokeType")}
            <div className="opt-row">
              {STROKE_TYPE_OPTS.map((s) => (
                <button key={s} className={style.strokeType === s ? "active" : ""}
                  title={tr(`strokeType.${s}`)} onClick={() => onStyle({ strokeType: s })}>
                  {strokeTypeIcon(s)}
                </button>
              ))}
            </div>
          </label>
        );
      case "lineType":
        return (
          <label className="dim small">{tr("style.lineType")}
            <div className="opt-row">
              {LINE_TYPE_OPTS.map((k) => (
                <button key={k} className={style.lineType === k ? "active" : ""}
                  title={tr(`lineType.${k}`)} onClick={() => onStyle({ lineType: k })}>
                  {lineTypeIcon(k)}
                </button>
              ))}
            </div>
          </label>
        );
      case "edges":
        return (
          <label className="dim small">{tr("style.edges")}
            <div className="opt-row">
              {EDGE_OPTS.map((k) => (
                <button key={k} className={style.edges === k ? "active" : ""}
                  title={tr(`edges.${k}`)} onClick={() => onStyle({ edges: k })}>
                  {edgeIcon(k)}
                </button>
              ))}
            </div>
          </label>
        );
      case "arrowStart": case "arrowEnd": {
        const key = spec === "arrowStart" ? "headStart" : "headEnd";
        return (
          <label className="dim small">{tr(`style.${spec}`)}
            <div className="opt-row">
              {HEAD_OPTS.map((h) => (
                <button key={h} className={style[key] === h ? "active" : ""}
                  title={tr(`head.${h}`)}
                  onClick={() => onStyle({ [key]: h })}>
                  {headIcon(h, spec === "arrowStart")}
                </button>
              ))}
            </div>
          </label>
        );
      }
      case "fontSize":
        return (
          <label className="dim small">{tr("style.fontSize")}
            <div className="opt-row">
              {FONT_SIZES.map(([s, label]) => (
                <button key={s} className={style.fontSize === s ? "active" : ""}
                  title={`${s}px`} onClick={() => onStyle({ fontSize: s })}>{label}</button>
              ))}
            </div>
          </label>
        );
      case "textAlign":
        return (
          <label className="dim small">{tr("style.textAlign")}
            <div className="opt-row">
              {TEXT_ALIGN_OPTS.map((a) => (
                <button key={a} className={style.textAlign === a ? "active" : ""}
                  title={tr(`textAlign.${a}`)} onClick={() => onStyle({ textAlign: a })}>
                  {textAlignIcon(a)}
                </button>
              ))}
            </div>
          </label>
        );
      case "link":
        return (
          <label className="dim small">{tr("style.link")}
            <div className="opt-row link-row">
              <input type="text" value={style.link || ""} placeholder={tr("style.linkPlaceholder")}
                onChange={(e) => onStyle({ link: e.target.value })}
                onKeyDown={(e) => e.stopPropagation()} />
              {style.link && (
                <a className="small-btn" href={style.link} target="_blank" rel="noreferrer"
                  title={tr("style.openLink")} onClick={(e) => e.stopPropagation()}>↗</a>
              )}
            </div>
          </label>
        );
      case "layers":
        return (
          <label className="dim small">{tr("style.layers")}
            <div className="opt-row">
              {LAYER_OPS.map(([op, icon, key]) => (
                <button key={op} title={tr(key)} disabled={!hasSelection}
                  onClick={() => onLayer(op)}>{icon}</button>
              ))}
              {layerInfo && <span className="layer-idx" title={tr("style.layerIndex")}>{layerInfo}</span>}
            </div>
          </label>
        );
    }
  };

  return (
    <div className="stylebar">
      {specs.map((spec) =>
        typeof spec === "string"
          ? <div key={spec}>{builtin(spec)}</div>
          : <div key={spec.key}>{spec.render(ctx)}</div>)}
    </div>
  );
}
