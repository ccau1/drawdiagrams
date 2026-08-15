// Lightweight i18n: translation dictionaries + locale switcher with
// localStorage persistence and browser-locale default.
import { useSyncExternalStore } from "react";
import en from "./en";
import zh from "./zh";

export type Locale = "en" | "zh";
const dicts: Record<Locale, Record<string, string>> = { en, zh };

const KEY = "drawboard.locale";
let current: Locale = detect();
const listeners = new Set<() => void>();

function detect(): Locale {
  const saved = localStorage.getItem(KEY);
  if (saved === "en" || saved === "zh") return saved;
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function getLocale(): Locale { return current; }

export function setLocale(l: Locale) {
  current = l;
  localStorage.setItem(KEY, l);
  document.documentElement.lang = l === "zh" ? "zh-CN" : "en";
  listeners.forEach((f) => f());
}

export const LOCALES: { id: Locale; label: string }[] = [
  { id: "en", label: "English" },
  { id: "zh", label: "简体中文" },
];

/** React hook: t("key", {name: "x"}) with {var} interpolation. */
export function useT() {
  useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => current,
  );
  return (key: string, vars?: Record<string, string | number>): string => {
    let s = dicts[current][key] ?? dicts.en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
}
