// Boards page: org switcher, board list, org creation, member invites.
import { useEffect, useState } from "react";
import { api, setToken } from "../api";
import type { AppCtx } from "../App";
import type { BoardMeta, Org } from "../types";
import { useT } from "../i18n";
import PluginsPanel from "../components/PluginsPanel";
import ThemePicker from "../components/ThemePicker";
import LocaleSwitcher from "../components/LocaleSwitcher";

export default function Boards({ ctx }: { ctx: AppCtx }) {
  const t = useT();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState<string>(localStorage.getItem("drawboard.org") || "");
  const [boards, setBoards] = useState<BoardMeta[]>([]);
  const [err, setErr] = useState("");
  const [showPlugins, setShowPlugins] = useState(false);

  const loadOrgs = async () => {
    const list = await api.orgs();
    setOrgs(list);
    if (!orgId || !list.some((o) => o.id === orgId)) {
      setOrgId(list[0]?.id || "");
    }
  };

  const loadBoards = async (id: string) => {
    if (!id) return setBoards([]);
    try { setBoards(await api.boards(id)); } catch (e: any) { setErr(e.message); }
  };

  useEffect(() => { loadOrgs().catch((e) => setErr(e.message)); }, []);
  useEffect(() => {
    localStorage.setItem("drawboard.org", orgId);
    loadBoards(orgId);
  }, [orgId]);

  const newBoard = async () => {
    const name = prompt(t("boards.boardName"), t("board.untitled"));
    if (!name || !orgId) return;
    const b = await api.createBoard(orgId, name);
    location.hash = `#/b/${b.id}`;
  };

  const newOrg = async () => {
    const name = prompt(t("boards.orgName"));
    if (!name) return;
    const o = await api.createOrg(name);
    await loadOrgs();
    setOrgId(o.id);
  };

  const invite = async () => {
    const email = prompt(t("boards.inviteEmail"));
    if (!email || !orgId) return;
    try { await api.addMember(orgId, email); alert("✓ " + email); }
    catch (e: any) { alert(e.message); }
  };

  const org = orgs.find((o) => o.id === orgId);

  return (
    <div className="boards-wrap">
      <header className="topbar">
        <div className="brand"><img className="brand-logo" src="/favicon.svg" alt="" /> Drawboard</div>
        <div className="org-switcher">
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <button onClick={newOrg} title={t("boards.orgName")}>{t("boards.newOrg")}</button>
          <button onClick={invite} title={t("boards.inviteEmail")}>{t("boards.invite")}</button>
        </div>
        <div className="spacer" />
        <button onClick={() => setShowPlugins(true)}>{t("boards.plugins")}</button>
        <ThemePicker ctx={ctx} />
        <LocaleSwitcher />
        <span className="dim">{ctx.user?.name}</span>
        <button onClick={() => { setToken(""); ctx.setUser(null); location.hash = "#/login"; }}>{t("boards.signout")}</button>
      </header>
      <main className="boards-main">
        <div className="boards-head">
          <h2>{org ? org.name : "Boards"}</h2>
          <button className="primary" onClick={newBoard} disabled={!orgId}>{t("boards.new")}</button>
        </div>
        {err && <div className="error">{err}</div>}
        <div className="board-grid">
          {boards.map((b) => (
            <div key={b.id} className="board-card" onClick={() => (location.hash = `#/b/${b.id}`)}>
              <div className="board-thumb">🗒️</div>
              <div className="board-name">{b.name}</div>
              <div className="dim small">{new Date(b.updatedAt).toLocaleString()}</div>
              <button
                className="danger small-btn"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (confirm(t("boards.confirmDelete", { name: b.name }))) { await api.deleteBoard(b.id); loadBoards(orgId); }
                }}
              >{t("boards.delete")}</button>
            </div>
          ))}
          {boards.length === 0 && <p className="dim">{t("boards.empty")}</p>}
        </div>
      </main>
      {showPlugins && <PluginsPanel ctx={ctx} onClose={() => setShowPlugins(false)} />}
    </div>
  );
}
