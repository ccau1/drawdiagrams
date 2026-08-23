// App: hash-based routing — #/login, #/boards, #/b/<id>.
import { useEffect, useState } from "react";
import { api, getToken, setToken } from "./api";
import type { Declaration, User } from "./types";
import { applyTheme, BUILTIN_THEMES, THEME_KEY } from "./theme";
import Login from "./pages/Login";
import Boards from "./pages/Boards";
import Board from "./pages/Board";

export interface AppCtx {
  user: User | null;
  setUser: (u: User | null) => void;
  decls: Declaration[];
  reloadDecls: () => Promise<void>;
  themes: typeof BUILTIN_THEMES;
}

const useHash = () => {
  const [h, setH] = useState(location.hash);
  useEffect(() => {
    const f = () => setH(location.hash);
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  return h;
};

export default function App() {
  const hash = useHash();
  const [user, setUser] = useState<User | null>(null);
  const [decls, setDecls] = useState<Declaration[]>([]);
  const [booted, setBooted] = useState(false);

  const reloadDecls = async () => {
    try { setDecls(await api.integrations()); } catch { /* offline */ }
  };

  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY) || "light";
    applyTheme(BUILTIN_THEMES.find((t) => t.id === saved) || BUILTIN_THEMES[0]);
    reloadDecls();

    // OAuth callback tokens arrive in the URL fragment as ?token=... on #/login.
    const hash = location.hash;
    const qIdx = hash.indexOf("?");
    const params = qIdx >= 0 ? new URLSearchParams(hash.slice(qIdx + 1)) : new URLSearchParams();
    const oauthToken = params.get("token");
    if (oauthToken) {
      setToken(oauthToken);
      const clean = hash.replace(/\?.*$/, "");
      history.replaceState(null, "", location.pathname + clean);
      api.me()
        .then((m) => setUser(m.user))
        .catch(() => setToken(""))
        .finally(() => setBooted(true));
      return;
    }

    if (getToken()) {
      api.me().then((m) => setUser(m.user)).catch(() => setToken("")).finally(() => setBooted(true));
    } else setBooted(true);
  }, []);

  // Themes from integrations become available everywhere.
  const pluginThemes = decls.flatMap((d) => d.themes || []);
  const themes = [...BUILTIN_THEMES, ...pluginThemes];

  if (!booted) return <div className="boot">Loading…</div>;

  const ctx: AppCtx = { user, setUser, decls, reloadDecls, themes };
  const boardMatch = hash.match(/^#\/b\/([\w-]+)/);
  if (boardMatch) return <Board ctx={ctx} boardId={boardMatch[1]} />;
  if (!user || hash.startsWith("#/login")) return <Login ctx={ctx} />;
  return <Boards ctx={ctx} />;
}
