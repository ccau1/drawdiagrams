// Native JSON importer — reads the Drawboard board format (with appState) or
// the older clipboard payload (elements only).
import { parseElements } from "../../clipboard";
import type { AppState, El, ImportResult } from "../../types";

export function importNativeJson(text: string): ImportResult {
  try {
    const data = JSON.parse(text);
    if (data?.kind === "drawboard/board" && Array.isArray(data.elements)) {
      return { elements: data.elements as El[], appState: data.appState as AppState | undefined };
    }
  } catch { /* not the board format */ }
  const els = parseElements(text);
  if (!els) throw new Error("Invalid Drawboard JSON file");
  return { elements: els };
}
