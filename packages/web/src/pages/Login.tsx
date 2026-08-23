import { useEffect, useState } from "react";
import { api, REDIRECT_AFTER_LOGIN_KEY, setToken, type AuthConfig } from "../api";
import type { AppCtx } from "../App";
import { useT } from "../i18n";
import LocaleSwitcher from "../components/LocaleSwitcher";

function parseHashQuery() {
  const hash = location.hash;
  const qIdx = hash.indexOf("?");
  if (qIdx < 0) return new URLSearchParams();
  return new URLSearchParams(hash.slice(qIdx + 1));
}

export default function Login({ ctx }: { ctx: AppCtx }) {
  const t = useT();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);

  // Surface OAuth errors returned via the callback redirect.
  useEffect(() => {
    const q = parseHashQuery();
    const error = q.get("error");
    if (error) {
      setErr(error);
      const clean = location.hash.replace(/\?.*$/, "");
      history.replaceState(null, "", location.pathname + clean);
    }
  }, []);

  useEffect(() => {
    api.authConfig()
      .then(setConfig)
      .catch(() => setConfig({ localEnabled: true, providers: [] }))
      .finally(() => setConfigLoading(false));
  }, []);

  // When only one SSO provider is available and local auth is disabled,
  // send the user straight to that provider (unless we are showing an error).
  useEffect(() => {
    if (!config || configLoading) return;
    if (config.providers.length === 1 && !config.localEnabled) {
      const q = parseHashQuery();
      if (!q.has("error")) {
        window.location.href = config.providers[0].authUrl;
      }
    }
  }, [config, configLoading]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = mode === "login"
        ? await api.login(email, password)
        : await api.register(email, username, name, password);
      setToken(r.token);
      ctx.setUser(r.user);
      const redirect = sessionStorage.getItem(REDIRECT_AFTER_LOGIN_KEY);
      sessionStorage.removeItem(REDIRECT_AFTER_LOGIN_KEY);
      location.hash = redirect || "#/boards";
    } catch (ex: any) {
      setErr(ex.message);
    } finally { setBusy(false); }
  };

  if (configLoading) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">{t("misc.loading")}</div>
      </div>
    );
  }

  const showLocal = config?.localEnabled ?? true;
  const hasSSO = (config?.providers.length ?? 0) > 0;

  return (
    <div className="auth-wrap">
      <div className="auth-lang"><LocaleSwitcher /></div>
      <form className="auth-card" onSubmit={submit}>
        <h1 className="brand"><img className="brand-logo" src="/favicon.svg" alt="" /> Drawboard</h1>
        <p className="dim">{t("app.tagline")}</p>

        {showLocal && (
          <>
            <div className="tabs">
              <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>{t("auth.signin")}</button>
              <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>{t("auth.register")}</button>
            </div>
            <input
              placeholder={mode === "login" ? t("auth.usernameOrEmail") : t("auth.email")}
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {mode === "register" && (
              <>
                <input placeholder={t("auth.username")} value={username} onChange={(e) => setUsername(e.target.value)} required minLength={2} />
                <input placeholder={t("auth.name")} value={name} onChange={(e) => setName(e.target.value)} required />
              </>
            )}
            <input placeholder={t("auth.password")} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            {err && <div className="error">{err}</div>}
            <button type="submit" className="primary" disabled={busy}>{busy ? "…" : mode === "login" ? t("auth.signin") : t("auth.create")}</button>
          </>
        )}

        {!showLocal && err && <div className="error">{err}</div>}

        {showLocal && hasSSO && <div className="auth-sep"><span>{t("auth.or")}</span></div>}

        {hasSSO && (
          <div className="auth-sso">
            {config!.providers.map((p) => (
              <button key={p.id} type="button" className="sso-btn" onClick={() => window.location.href = p.authUrl}>
                {t("auth.continueWith")} {p.name}
              </button>
            ))}
          </div>
        )}

        {!showLocal && !hasSSO && (
          <div className="error">No authentication methods are configured.</div>
        )}
      </form>
    </div>
  );
}
