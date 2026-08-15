import { getLocale, LOCALES, setLocale, useT } from "../i18n";

export default function LocaleSwitcher() {
  useT(); // subscribe to locale changes
  return (
    <select
      title="Language / 语言"
      value={getLocale()}
      onChange={(e) => setLocale(e.target.value as any)}
    >
      {LOCALES.map((l) => (
        <option key={l.id} value={l.id}>🌐 {l.label}</option>
      ))}
    </select>
  );
}
