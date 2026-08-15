// Theme manager: built-in themes + themes declared by integrations. A theme
// sets CSS variables (whole UI) and canvas drawing styles.
import type { CanvasTheme, ThemeDecl } from "./types";

export const BUILTIN_THEMES: ThemeDecl[] = [
  {
    id: "light", label: "Light", dark: false,
    vars: {
      "--bg": "#ffffff", "--panel": "#f6f6f8", "--panel-border": "#e3e3e8",
      "--text": "#1b1b1f", "--text-dim": "#6b6b76", "--accent": "#6965db",
      "--accent-text": "#ffffff", "--hover": "#ececf4", "--danger": "#e03131",
    },
    canvas: {
      background: "#ffffff", gridColor: "#d3d3dc", stroke: "#1b1b1f",
      palette: ["#1b1b1f", "#e03131", "#2f9e44", "#1971c2", "#f08c00", "#9c36b5", "#ffffff", "#ffd8a8", "#b2f2bb", "#a5d8ff"],
      fillStyle: "solid", roughness: 1.2, selectionBox: "#6965db",
    },
  },
  {
    id: "dark", label: "Dark", dark: true,
    vars: {
      "--bg": "#161618", "--panel": "#1e1e22", "--panel-border": "#33333a",
      "--text": "#e8e8ec", "--text-dim": "#9a9aa5", "--accent": "#8b88f0",
      "--accent-text": "#161618", "--hover": "#2a2a31", "--danger": "#ff6b6b",
    },
    canvas: {
      background: "#161618", gridColor: "#2c2c33", stroke: "#e8e8ec",
      palette: ["#e8e8ec", "#ff6b6b", "#51cf66", "#4dabf7", "#ffa94d", "#da77f2", "#ffffff", "#ffd8a8", "#b2f2bb", "#a5d8ff"],
      fillStyle: "solid", roughness: 1.2, selectionBox: "#8b88f0",
    },
  },
  {
    id: "sketch", label: "Sketch", dark: false,
    vars: {
      "--bg": "#fdf6e3", "--panel": "#f7eeda", "--panel-border": "#e0d3b8",
      "--text": "#3a3a32", "--text-dim": "#8a826e", "--accent": "#b58900",
      "--accent-text": "#fdf6e3", "--hover": "#efe4cb", "--danger": "#dc322f",
    },
    canvas: {
      background: "#fdf6e3", gridColor: "#e7dcc2", stroke: "#3a3a32",
      palette: ["#3a3a32", "#dc322f", "#859900", "#268bd2", "#d33682", "#b58900"],
      fillStyle: "solid", roughness: 1.6, selectionBox: "#b58900",
    },
  },
  {
    id: "midnight", label: "Midnight", dark: true,
    vars: {
      "--bg": "#0b1020", "--panel": "#111832", "--panel-border": "#232c4d",
      "--text": "#dbe4ff", "--text-dim": "#748ffc", "--accent": "#4dabf7",
      "--accent-text": "#0b1020", "--hover": "#182245", "--danger": "#ff8787",
    },
    canvas: {
      background: "#0b1020", gridColor: "#1d2749", stroke: "#dbe4ff",
      palette: ["#dbe4ff", "#ff8787", "#69db7c", "#4dabf7", "#ffa94d", "#e599f7"],
      fillStyle: "solid", roughness: 1.2, selectionBox: "#4dabf7",
    },
  },
];

export function applyTheme(t: ThemeDecl) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(k, v);
  root.dataset.theme = t.id;
  root.style.colorScheme = t.dark ? "dark" : "light";
}

export const THEME_KEY = "drawboard.theme";
