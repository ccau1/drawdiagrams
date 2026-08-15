import { useState } from "react";
import { api, setToken } from "../api";
import type { AppCtx } from "../App";
import { useT } from "../i18n";
import LocaleSwitcher from "../components/LocaleSwitcher";

export default function Login({ ctx }: { ctx: AppCtx }) {
  const t = useT();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = mode === "login"
        ? await api.login(email, password)
        : await api.register(email, name, password);
      setToken(r.token);
      ctx.setUser(r.user);
      location.hash = "#/boards";
    } catch (ex: any) {
      setErr(ex.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-lang"><LocaleSwitcher /></div>
      <form className="auth-card" onSubmit={submit}>
        <h1 className="brand"><img className="brand-logo" src="/favicon.svg" alt="" /> Drawboard</h1>
        <p className="dim">{t("app.tagline")}</p>
        <div className="tabs">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>{t("auth.signin")}</button>
          <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>{t("auth.register")}</button>
        </div>
        <input placeholder={t("auth.email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {mode === "register" && (
          <input placeholder={t("auth.name")} value={name} onChange={(e) => setName(e.target.value)} required />
        )}
        <input placeholder={t("auth.password")} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <div className="error">{err}</div>}
        <button className="primary" disabled={busy}>{busy ? "…" : mode === "login" ? t("auth.signin") : t("auth.create")}</button>
      </form>
    </div>
  );
}
