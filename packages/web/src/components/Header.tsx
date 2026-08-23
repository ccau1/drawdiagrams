// Sticky glass top bar for the boards page: brand, org switcher, search,
// new-board action, plugins entry and the account avatar dropdown.
// The blur lives on .topbar::before so position:fixed overlays inside
// (menu-overlay) are not trapped by a backdrop-filter containing block.
import { useState } from "react";
import type { AppCtx } from "../App";
import type { Org } from "../types";
import { useT } from "../i18n";
import ThemePicker from "./ThemePicker";
import LocaleSwitcher from "./LocaleSwitcher";
import {
  ChevronDownIcon, GlobeIcon, PluginsIcon, PlusIcon,
  SearchIcon, SignOutIcon, SunIcon, UserIcon,
} from "./icons";

export default function Header({ ctx, orgs, orgId, onOrgChange, onNewOrg, onInvite, onNewBoard, onPlugins, query, onQueryChange, onSignOut }: {
  ctx: AppCtx;
  orgs: Org[];
  orgId: string;
  onOrgChange: (id: string) => void;
  onNewOrg: () => void;
  onInvite: () => void;
  onNewBoard: () => void;
  onPlugins: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  onSignOut: () => void;
}) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = (ctx.user?.name || "?")
    .split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  return (
    <header className="topbar">
      <div className="brand"><img className="brand-logo" src="/favicon.svg" alt="" /> Drawboard</div>
      <div className="org-switcher">
        <select value={orgId} onChange={(e) => onOrgChange(e.target.value)}>
          {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <button className="icon-btn" onClick={onNewOrg} title={t("boards.newOrg")}><PlusIcon /></button>
        <button className="icon-btn" onClick={onInvite} title={t("boards.invite")}><UserIcon /></button>
      </div>
      <div className="spacer" />
      <div className="search-wrap">
        <SearchIcon />
        <input
          className="search-input"
          placeholder={t("boards.search")}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </div>
      <button className="primary" onClick={onNewBoard} disabled={!orgId}>
        <PlusIcon /> {t("boards.new")}
      </button>
      <button className="icon-btn" onClick={onPlugins} title={t("boards.plugins")}><PluginsIcon /></button>
      <div className="menu-anchor">
        <button className="avatar-btn" title={t("boards.account")} onClick={() => setMenuOpen((v) => !v)}>
          <span className="avatar">{initials}</span>
          <ChevronDownIcon size={14} />
        </button>
        {menuOpen && (
          <>
            <div className="menu-overlay" onClick={() => setMenuOpen(false)} />
            <div className="menu-popup avatar-menu">
              <div className="avatar-menu-head">
                <span className="avatar">{initials}</span>
                <div className="avatar-menu-id">
                  <div className="avatar-menu-name">{ctx.user?.name}</div>
                  <div className="dim small">{ctx.user?.email}</div>
                </div>
              </div>
              <div className="menu-row">
                <span><SunIcon size={14} className="menu-icon" /> {t("misc.theme")}</span>
                <ThemePicker ctx={ctx} />
              </div>
              <div className="menu-row">
                <span><GlobeIcon size={14} className="menu-icon" /> {t("misc.language")}</span>
                <LocaleSwitcher />
              </div>
              <div className="menu-sep" />
              <button className="menu-popup-item" onClick={onSignOut}>
                <SignOutIcon size={15} /> {t("boards.signout")}
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
