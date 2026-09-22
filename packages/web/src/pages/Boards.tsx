// Boards page: org switcher, folder browser (folder rows on top, board grid
// below), item ⋯ menus opening modals, org creation, member invites.
import { useEffect, useState } from "react";
import { api, setToken } from "../api";
import type { AppCtx } from "../App";
import type { BoardMeta, Folder, Org } from "../types";
import { useT } from "../i18n";
import PluginsPanel from "../components/PluginsPanel";
import Header from "../components/Header";
import { BoardIcon, FolderIcon, MoreIcon, PlusIcon, SearchIcon, XIcon } from "../components/icons";

// descendantIDs returns the id plus all nested subfolder ids of a folder.
function descendantIDs(folders: Folder[], id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parentId && out.has(f.parentId) && !out.has(f.id)) {
        out.add(f.id);
        grew = true;
      }
    }
  }
  return out;
}

// folderDepth walks the parent chain to compute nesting depth (root = 0).
function folderDepth(byId: Map<string, Folder>, f: Folder): number {
  let d = 0;
  for (let cur = f.parentId; cur; ) {
    const p = byId.get(cur);
    if (!p) break;
    d++;
    cur = p.parentId;
  }
  return d;
}

// boardHue derives a deterministic hue from a board id for its thumbnail.
function boardHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

type ItemRef = { kind: "folder" | "board"; id: string; name: string };
type ModalState =
  | { type: "move"; item: ItemRef }
  | { type: "delete"; item: ItemRef }
  | null;

export default function Boards({ ctx }: { ctx: AppCtx }) {
  const t = useT();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState<string>(localStorage.getItem("drawboard.org") || "");
  const [boards, setBoards] = useState<BoardMeta[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentFolder, setCurrentFolder] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null); // "kind:id"
  const [modal, setModal] = useState<ModalState>(null);
  const [err, setErr] = useState("");
  const [showPlugins, setShowPlugins] = useState(false);
  const [query, setQuery] = useState("");

  const loadOrgs = async () => {
    const list = await api.orgs();
    setOrgs(list);
    if (!orgId || !list.some((o) => o.id === orgId)) {
      setOrgId(list[0]?.id || "");
    }
  };

  const loadAll = async (id: string) => {
    if (!id) { setBoards([]); setFolders([]); return; }
    try {
      const [b, f] = await Promise.all([api.boards(id), api.folders(id)]);
      setBoards(b);
      setFolders(f);
    } catch (e: any) { setErr(e.message); }
  };

  useEffect(() => { loadOrgs().catch((e) => setErr(e.message)); }, []);
  useEffect(() => {
    localStorage.setItem("drawboard.org", orgId);
    setCurrentFolder("");
    loadAll(orgId);
  }, [orgId]);

  const newBoard = async () => {
    const name = prompt(t("boards.boardName"), t("board.untitled"));
    if (!name || !orgId) return;
    const b = await api.createBoard(orgId, name, currentFolder || undefined);
    location.hash = `#/b/${b.id}`;
  };

  const newFolder = async () => {
    const name = prompt(t("boards.folderName"));
    if (!name || !orgId) return;
    await api.createFolder(orgId, name, currentFolder || undefined);
    loadAll(orgId);
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
  const byId = new Map(folders.map((f) => [f.id, f]));
  const cur = currentFolder ? byId.get(currentFolder) : undefined;

  // Breadcrumb: walk parents from the current folder up to the root.
  const crumbs: Folder[] = [];
  for (let c = currentFolder; c; ) {
    const f = byId.get(c);
    if (!f) break;
    crumbs.unshift(f);
    c = f.parentId || "";
  }

  const levelFolders = folders.filter((f) => (f.parentId || "") === currentFolder);
  const levelBoards = boards.filter((b) => (b.folderId || "") === currentFolder);

  // Case-insensitive name filter driven by the header search box.
  const q = query.trim().toLowerCase();
  const match = (name: string) => !q || name.toLowerCase().includes(q);
  const visFolders = levelFolders.filter((f) => match(f.name));
  const visBoards = levelBoards.filter((b) => match(b.name));

  const openModal = (m: NonNullable<ModalState>) => { setMenuFor(null); setModal(m); };

  // More menu shared by folder rows and board cards.
  const itemMenu = (item: ItemRef) => {
    const key = `${item.kind}:${item.id}`;
    return (
      <div className="menu-anchor" onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}>
        <button
          className="more-btn"
          title={t("boards.more")}
          onClick={() => setMenuFor(menuFor === key ? null : key)}
        ><MoreIcon /></button>
        {menuFor === key && (
          <>
            <div className="menu-overlay" onClick={() => setMenuFor(null)} />
            <div className="menu-popup">
              <button className="menu-popup-item" onClick={() => openModal({ type: "move", item })}>
                {t("boards.move")}
              </button>
              <button className="menu-popup-item danger" onClick={() => openModal({ type: "delete", item })}>
                {t("boards.delete")}
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  const doMove = async (item: ItemRef, target: string) => {
    if (item.kind === "board") await api.moveBoard(item.id, target);
    else await api.moveFolder(item.id, target);
    setModal(null);
    loadAll(orgId);
  };

  const doDelete = async (item: ItemRef) => {
    if (item.kind === "board") await api.deleteBoard(item.id);
    else {
      const parent = byId.get(item.id)?.parentId || "";
      await api.deleteFolder(item.id);
      if (item.id === currentFolder) setCurrentFolder(parent);
    }
    setModal(null);
    loadAll(orgId);
  };

  return (
    <div className="boards-wrap">
      <Header
        ctx={ctx}
        orgs={orgs}
        orgId={orgId}
        onOrgChange={setOrgId}
        onNewOrg={newOrg}
        onInvite={invite}
        onNewBoard={newBoard}
        onPlugins={() => setShowPlugins(true)}
        query={query}
        onQueryChange={setQuery}
        onSignOut={() => { setToken(""); ctx.setUser(null); location.hash = "#/login"; }}
      />
      <main className="boards-main">
        <div className="boards-head">
          <div>
            <h2>{org ? org.name : t("boards.title")}</h2>
            <div className="dim small">{t("boards.counts", { folders: levelFolders.length, boards: levelBoards.length })}</div>
          </div>
          <div className="boards-actions">
            <button className="ghost" onClick={newFolder} disabled={!orgId}><FolderIcon /> {t("boards.newFolder")}</button>
            <button className="primary" onClick={newBoard} disabled={!orgId}><PlusIcon /> {t("boards.new")}</button>
          </div>
        </div>
        {err && <div className="error">{err}</div>}
        <nav className="breadcrumb">
          <span className={"crumb" + (!currentFolder ? " current" : "")} onClick={() => setCurrentFolder("")}>
            {org ? org.name : t("boards.root")}
          </span>
          {crumbs.map((f) => (
            <span
              key={f.id}
              className={"crumb" + (f.id === currentFolder ? " current" : "")}
              onClick={() => setCurrentFolder(f.id)}
            >{f.name}</span>
          ))}
          {cur && (
            <span className="folder-actions">
              <button className="small-btn" onClick={() => openModal({ type: "move", item: { kind: "folder", id: cur.id, name: cur.name } })}>
                {t("boards.move")}
              </button>
              <button className="small-btn danger" onClick={() => openModal({ type: "delete", item: { kind: "folder", id: cur.id, name: cur.name } })}>
                {t("boards.delete")}
              </button>
            </span>
          )}
        </nav>

        {visFolders.length > 0 && (
          <div className="folder-list">
            {visFolders.map((f) => (
              <div key={f.id} className="folder-row" onClick={() => setCurrentFolder(f.id)}>
                <span className="folder-icon"><FolderIcon /></span>
                <span className="folder-name">{f.name}</span>
                {itemMenu({ kind: "folder", id: f.id, name: f.name })}
              </div>
            ))}
          </div>
        )}

        <div className="board-grid">
          {visBoards.map((b) => {
            const hue = boardHue(b.id);
            return (
            <a key={b.id} className="board-card" href={`#/b/${b.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                {itemMenu({ kind: "board", id: b.id, name: b.name })}
                {b.thumbnail ? (
                  <img className="board-thumb board-thumb-img" src={b.thumbnail} alt="" />
                ) : (
                  <div
                    className="board-thumb"
                    style={{ background: `linear-gradient(135deg, hsl(${hue} 60% 65%), hsl(${(hue + 40) % 360} 60% 55%))` }}
                  >
                    <span>{(b.name[0] || "?").toUpperCase()}</span>
                  </div>
                )}
                <div className="board-name">{b.name}</div>
                <div className="dim small">{new Date(b.updatedAt).toLocaleString()}</div>
            </a>
            );
          })}
        </div>

        {visFolders.length === 0 && visBoards.length === 0 && (
          q ? (
            <div className="empty-state">
              <div className="empty-icon"><SearchIcon size={32} /></div>
              <p className="dim">{t("boards.noResults", { q: query.trim() })}</p>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon"><BoardIcon size={32} /></div>
              <p className="dim">{t("boards.empty")}</p>
              <button className="primary" onClick={newBoard} disabled={!orgId}>
                <PlusIcon /> {t("boards.new")}
              </button>
            </div>
          )
        )}
      </main>

      {modal?.type === "move" && (
        <MoveModal
          t={t}
          item={modal.item}
          folders={folders}
          exclude={modal.item.kind === "folder" ? descendantIDs(folders, modal.item.id) : new Set()}
          byId={byId}
          onCancel={() => setModal(null)}
          onConfirm={(target) => doMove(modal.item, target).catch((e) => { setModal(null); alert(e.message); })}
        />
      )}
      {modal?.type === "delete" && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal small-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{t("boards.delete")}</h3>
              <button className="icon-btn" onClick={() => setModal(null)}><XIcon /></button>
            </div>
            <p>
              {modal.item.kind === "folder"
                ? t("boards.confirmDeleteFolder", { name: modal.item.name })
                : t("boards.confirmDelete", { name: modal.item.name })}
            </p>
            <div className="modal-actions">
              <button onClick={() => setModal(null)}>{t("boards.cancel")}</button>
              <button className="danger" onClick={() => doDelete(modal.item).catch((e) => { setModal(null); alert(e.message); })}>
                {t("boards.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
      {showPlugins && <PluginsPanel ctx={ctx} onClose={() => setShowPlugins(false)} />}
    </div>
  );
}

// MoveModal: pick a destination folder (or root) for a board or folder.
function MoveModal({ t, item, folders, exclude, byId, onCancel, onConfirm }: {
  t: (k: string, p?: Record<string, string>) => string;
  item: ItemRef;
  folders: Folder[];
  exclude: Set<string>;
  byId: Map<string, Folder>;
  onCancel: () => void;
  onConfirm: (target: string) => void;
}) {
  const [target, setTarget] = useState<string | null>(null);
  const choices = folders.filter((f) => !exclude.has(f.id));
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal small-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{t("boards.moveTo", { name: item.name })}</h3>
          <button className="icon-btn" onClick={onCancel}><XIcon /></button>
        </div>
        <div className="move-list">
          <div
            className={"move-row" + (target === "" ? " selected" : "")}
            onClick={() => setTarget("")}
          >🏠 {t("boards.root")}</div>
          {choices.map((f) => (
            <div
              key={f.id}
              className={"move-row" + (target === f.id ? " selected" : "")}
              style={{ paddingLeft: 12 + folderDepth(byId, f) * 18 }}
              onClick={() => setTarget(f.id)}
            ><FolderIcon size={15} /> {f.name}</div>
          ))}
        </div>
        <div className="modal-actions">
          <button onClick={onCancel}>{t("boards.cancel")}</button>
          <button className="primary" disabled={target === null} onClick={() => onConfirm(target!)}>
            {t("boards.confirmMove")}
          </button>
        </div>
      </div>
    </div>
  );
}
