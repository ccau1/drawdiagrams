// Web-side logic for the built-in Go integrations. The Go side declares
// *what* is injected (draws/reactions/themes/commands); these handlers supply
// the *behavior* on the web, keyed by the same integration name.
import { registerWebIntegration } from "../integrations";
import { importDrawio } from "./drawio";
import type { El } from "../types";

registerWebIntegration({
  name: "uml-shapes",
  importers: [
    {
      extensions: ["drawio", "xml"],
      label: "draw.io diagram (.drawio / .xml)",
      run: importDrawio,
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
  name: "emoji-reactions",
  // Reaction behavior is handled by the board itself (float-up + broadcast);
  // the web handler exists so future reaction packs can customize behavior.
});
