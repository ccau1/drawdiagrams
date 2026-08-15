// Web-side integration runtime. Server integrations declare data via
// Inject() ({ draws, reactions, themes, commands }); each integration may
// ALSO ship web-side logic: for built-ins it lives here in `builtinHandlers`,
// and for installed plugins the manifest may reference handler behavior by
// convention (pluginName + hook). A web handler can extend many areas of the
// app: draw behaviors, importers, canvas hooks, and command actions.
import type { Declaration, DrawDecl, El } from "./types";
import type { PropSpec } from "./tools";

/** What a web-side integration handler can hook into. */
export interface WebIntegration {
  name: string;
  /** Import hooks: file extensions this integration can convert to elements. */
  importers?: Importer[];
  /** Extra behavior applied after a draw item is placed on the canvas. */
  onPlace?: (el: El) => El;
  /** Command actions declared by the integration (CommandDecl.action). */
  actions?: Record<string, (ctx: ActionCtx) => void>;
  /** Override a draw's property panel specs (custom props, etc.). */
  propsForDraw?: (d: DrawDecl) => PropSpec[];
}

export interface Importer {
  /** e.g. ["drawio", "xml"] */
  extensions: string[];
  label: string;
  run: (fileText: string) => El[];
}

export interface ActionCtx {
  elements: () => El[];
  replaceAll: (els: El[]) => void;
  alert: (msg: string) => void;
}

const registry = new Map<string, WebIntegration>();

export function registerWebIntegration(w: WebIntegration) {
  registry.set(w.name, w);
}

/** Merge every active web integration's importers, in declaration order. */
export function allImporters(decls: Declaration[]): Importer[] {
  const out: Importer[] = [];
  for (const d of decls) {
    const w = registry.get(d.name);
    if (w?.importers) out.push(...w.importers);
  }
  return out;
}

/** Run a declared command action if a web handler provides it. */
export function runAction(decls: Declaration[], action: string, ctx: ActionCtx): boolean {
  for (const d of decls) {
    if (!(d.commands || []).some((c) => c.action === action)) continue;
    const w = registry.get(d.name);
    const fn = w?.actions?.[action];
    if (fn) { fn(ctx); return true; }
  }
  return false;
}

/** Post-process a placed element through the owning integration. */
export function afterPlace(decls: Declaration[], drawDecl: DrawDecl, el: El): El {
  for (const d of decls) {
    if ((d.draws || []).some((x) => x.id === drawDecl.id)) {
      const w = registry.get(d.name);
      if (w?.onPlace) return w.onPlace(el);
    }
  }
  return el;
}

/** Property panel override from the integration that declared this draw. */
export function drawPropOverride(decls: Declaration[], drawDecl: DrawDecl): PropSpec[] | undefined {
  for (const d of decls) {
    if ((d.draws || []).some((x) => x.id === drawDecl.id)) {
      const w = registry.get(d.name);
      if (w?.propsForDraw) return w.propsForDraw(drawDecl);
    }
  }
  return undefined;
}
