// Cross-board copy/paste: selection is serialized to a tagged JSON payload
// on the clipboard ("drawboard/elements"), so it can be pasted into any
// other board — in another tab, org, or even another deployment. Pasted
// elements get fresh ids and timestamps, and are broadcast as normal ops.
import type { El } from "./types";
import { uid } from "./types";

const CLIP_TAG = "drawboard/elements";

export interface ClipboardPayload {
  kind: typeof CLIP_TAG;
  version: 1;
  elements: El[];
}

export function serializeElements(els: El[]): string {
  const payload: ClipboardPayload = { kind: CLIP_TAG, version: 1, elements: els };
  return JSON.stringify(payload, null, 2);
}

export function parseElements(text: string): El[] | null {
  try {
    const data = JSON.parse(text);
    if (data?.kind === CLIP_TAG && Array.isArray(data.elements)) {
      return data.elements;
    }
  } catch { /* not our payload */ }
  return null;
}

/** Clone elements with fresh ids, offset near a target world point. */
export function cloneForPaste(els: El[], targetX: number, targetY: number): El[] {
  if (!els.length) return [];
  const minX = Math.min(...els.map((e) => e.x));
  const minY = Math.min(...els.map((e) => e.y));
  const maxX = Math.max(...els.map((e) => e.x + Math.abs(e.w)));
  return els.map((e) => ({
    ...e,
    id: uid(),
    x: e.x + (targetX - (minX + maxX) / 2),
    y: e.y + (targetY - minY) - 40,
    points: e.points ? [...e.points] : undefined,
    updatedAt: Date.now(),
  }));
}
