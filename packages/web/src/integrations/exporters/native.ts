// Native JSON exporter — uses the board format so appState round-trips too.
import type { AppState, El } from "../../types";

export function exportNativeJson(els: El[], appState?: AppState): string {
  return JSON.stringify({ kind: "drawboard/board", version: 1, elements: els, appState: appState ?? {} }, null, 2);
}
