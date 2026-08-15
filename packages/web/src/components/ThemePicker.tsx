import { applyTheme, THEME_KEY } from "../theme";
import type { AppCtx } from "../App";
import { useT } from "../i18n";

export default function ThemePicker({ ctx }: { ctx: AppCtx }) {
  const t = useT();
  return (
    <select
      defaultValue={localStorage.getItem(THEME_KEY) || "light"}
      onChange={(e) => {
        const t = ctx.themes.find((x) => x.id === e.target.value);
        if (t) {
          applyTheme(t);
          localStorage.setItem(THEME_KEY, t.id);
          // canvas theme is read reactively in Board via themechange event
          dispatchEvent(new CustomEvent("themechange", { detail: t.id }));
        }
      }}
      title={t("misc.theme")}
    >
      {ctx.themes.map((t) => (
        <option key={t.id} value={t.id}>
          {t.dark ? "🌙" : "☀️"} {t.label}
        </option>
      ))}
    </select>
  );
}
