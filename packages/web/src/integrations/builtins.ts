// Web-side logic for the built-in Go integrations. The Go side declares
// *what* is injected (draws/reactions/themes/commands/imports/exports); these
// handlers supply the *behavior* on the web, keyed by the same integration name.
import { registerWebIntegration } from "../integrations";
import { importDrawio } from "./importers/drawio";
import { importNativeJson } from "./importers/native";
import { importExcalidraw } from "./importers/excalidraw";
import { exportDrawio } from "./exporters/drawio";
import { exportNativeJson } from "./exporters/native";
import { exportExcalidraw } from "./exporters/excalidraw";
import type { El } from "../types";

registerWebIntegration({
  name: "uml-shapes",
  importers: [
    {
      id: "drawio",
      extensions: ["drawio", "xml"],
      label: "draw.io diagram (.drawio / .xml)",
      run: importDrawio,
    },
  ],
  exporters: [
    {
      id: "drawio",
      label: "draw.io diagram (.drawio)",
      extension: "drawio",
      mimeType: "application/xml",
      run: exportDrawio,
    },
  ],
  actions: {
    // Declared by uml-shapes' Inject() commands.
    "uml.autolayout": ({ elements, replaceAll, alert }) => {
      const els = elements();
      const shapes = els.filter((e) => e.type === "shape" && e.shape?.startsWith("uml-"));
      if (shapes.length < 2) { alert("Place at least two UML shapes to auto-layout."); return; }
      // Simple layered layout: rows of equal heights, centered.
      const gap = 60, rowH = 220, perRow = Math.ceil(Math.sqrt(shapes.length));
      let maxX = 0;
      const ids = new Set(shapes.map((s) => s.id));
      const laidOut = els.map((e) => {
        if (!ids.has(e.id)) return e;
        const i = shapes.findIndex((s) => s.id === e.id);
        const col = i % perRow, row = Math.floor(i / perRow);
        const x = 80 + col * 260, y = 80 + row * rowH;
        maxX = Math.max(maxX, x);
        return { ...e, x, y, updatedAt: Date.now() };
      });
      replaceAll(laidOut);
    },
  },
});

registerWebIntegration({
  name: "aws-icons",
  // AWS icons get a default orange stroke when placed, regardless of the
  // currently selected stroke color.
  onPlace: (el: El): El => ({ ...el, stroke: el.stroke === "#1b1b1f" ? "#e88434" : el.stroke }),
});

registerWebIntegration({
  name: "drawboard",
  importers: [
    {
      id: "native-json",
      extensions: ["drawboard.json", "json"],
      label: "Drawboard JSON (.drawboard.json / .json)",
      run: importNativeJson,
    },
  ],
  exporters: [
    {
      id: "native-json",
      label: "Drawboard JSON (.drawboard.json)",
      extension: "drawboard.json",
      mimeType: "application/json",
      run: exportNativeJson,
    },
  ],
});

registerWebIntegration({
  name: "excalidraw",
  importers: [
    {
      id: "excalidraw",
      extensions: ["excalidraw", "json"],
      label: "Excalidraw (.excalidraw / .json)",
      multiple: true,
      run: importExcalidraw,
    },
  ],
  exporters: [
    {
      id: "excalidraw",
      label: "Excalidraw (.excalidraw)",
      extension: "excalidraw",
      mimeType: "application/json",
      run: exportExcalidraw,
    },
  ],
});

registerWebIntegration({
  name: "emoji-reactions",
  // Reaction behavior is handled by the board itself (float-up + broadcast);
  // the web handler exists so future reaction packs can customize behavior.
});
