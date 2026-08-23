// Plugins panel: lists integrations (built-in + installed), installs from a
// zip file, and browses the online marketplace catalog.
import { useRef, useState } from "react";
import { api } from "../api";
import type { AppCtx } from "../App";
import { useT } from "../i18n";

// Marketplace catalog: hosted plugin zips installable in one click. The
// "marketplace" here is this repo's own catalog endpoint — each entry is a
// zip URL the server downloads and installs like an uploaded zip.
const MARKETPLACE = [
  {
    name: "gcp-icons",
    title: "GCP Icons",
    description: "Google Cloud architecture icons (Compute, GKE, BigQuery…)",
    version: "1.0.0",
    hasDraws: true,
  },
  {
    name: "flowchart-pack",
    title: "Flowchart Pack",
    description: "Extra flowchart shapes: terminator, decision, document, data",
    version: "1.0.0",
    hasDraws: true,
  },
  {
    name: "devops-icons",
    title: "DevOps Icons",
    description: "Monitoring & alerting icons: Prometheus, Grafana, Cloudflare, PagerDuty, OneUptime, Regen…",
    version: "1.0.0",
    hasDraws: true,
  },
  {
    name: "messenger-icons",
    title: "Messenger Icons",
    description: "Chat & communication icons: Slack, Teams, WhatsApp, Telegram, CC…",
    version: "1.0.0",
    hasDraws: true,
  },
  {
    name: "retro-theme",
    title: "Retro Theme Pack",
    description: "Neon-retro UI + canvas theme with glow palette",
    version: "1.0.0",
    hasDraws: false,
  },
];

export default function PluginsPanel({ ctx, onClose, forShapes }: { ctx: AppCtx; onClose: () => void; forShapes?: boolean }) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };

  const upload = async (f: File) => {
    setBusy("upload");
    try {
      const d = await api.uploadPlugin(f);
      await ctx.reloadDecls();
      flash(t("plugins.installedOk", { name: d.name, version: d.version }));
    } catch (e: any) { flash(t("plugins.error", { msg: e.message })); }
    finally { setBusy(""); }
  };

  const installFromMarket = async (name: string) => {
    setBusy(name);
    try {
      const res = await fetch(`/marketplace/${name}.zip`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], `${name}.zip`, { type: "application/zip" });
      await upload(file);
    } catch (e: any) { flash(t("plugins.marketFailed", { msg: e.message })); }
    finally { setBusy(""); }
  };

  const installed = ctx.decls.map((d) => d.name);
  const visibleDecls = forShapes ? ctx.decls.filter((d) => (d.draws?.length || 0) > 0) : ctx.decls;
  const visibleMarket = forShapes ? MARKETPLACE.filter((m) => m.hasDraws) : MARKETPLACE;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{t(forShapes ? "plugins.shapeTitle" : "plugins.title")}</h3>
          <button onClick={onClose}>✕</button>
        </div>
        {msg && <div className="notice">{msg}</div>}

        <h4>{t("plugins.installed")}</h4>
        <div className="plugin-list">
          {forShapes && visibleDecls.length === 0 && (
            <div className="dim small">{t("plugins.noShapesInstalled")}</div>
          )}
          {visibleDecls.map((d) => (
            <div key={d.name} className="plugin-row">
              <div>
                <b>{d.name}</b> <span className="dim">v{d.version} by {d.author}</span>
                <div className="dim small">{d.description}</div>
                <div className="dim small">
                  {(d.draws?.length || 0) > 0 && `${d.draws!.length} ${t("plugins.draws")} · `}
                  {(d.reactions?.length || 0) > 0 && `${d.reactions!.length} ${t("plugins.reactions")} · `}
                  {(d.themes?.length || 0) > 0 && `${d.themes!.length} ${t("plugins.themes")} · `}
                  {(d.imports?.length || 0) > 0 && `${d.imports!.length} ${t("plugins.imports")} · `}
                  {(d.exports?.length || 0) > 0 && `${d.exports!.length} ${t("plugins.exports")}`}
                  {d.builtin && ` · ${t("plugins.builtin")}`}
                </div>
              </div>
              {!d.builtin && (
                <button className="danger small-btn" onClick={async () => {
                  await api.deletePlugin(d.name);
                  await ctx.reloadDecls();
                  flash(t("plugins.uninstalled", { name: d.name }));
                }}>{t("plugins.remove")}</button>
              )}
            </div>
          ))}
        </div>

        <h4>{t("plugins.installZip")}</h4>
        <p className="dim small">
          {t("plugins.zipDesc")}
        </p>
        <input ref={fileRef} type="file" accept=".zip" hidden
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <button onClick={() => fileRef.current?.click()} disabled={busy === "upload"}>
          {busy === "upload" ? t("plugins.installing") : t("plugins.choose")}
        </button>

        <h4>{t("plugins.marketplace")}</h4>
        <div className="plugin-list">
          {visibleMarket.length === 0 && (
            <div className="dim small">{t("plugins.noShapesAvailable")}</div>
          )}
          {visibleMarket.map((m) => (
            <div key={m.name} className="plugin-row">
              <div>
                <b>{m.title}</b> <span className="dim">v{m.version}</span>
                <div className="dim small">{m.description}</div>
              </div>
              {installed.includes(m.name) ? (
                <span className="dim small">{t("plugins.installedTag")}</span>
              ) : (
                <button className="small-btn primary" disabled={!!busy}
                  onClick={() => installFromMarket(m.name)}>
                  {busy === m.name ? "…" : t("plugins.install")}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
