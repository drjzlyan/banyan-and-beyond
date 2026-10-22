import { useCallback, useEffect, useState } from "react";
import { EpisodeView } from "./EpisodeView.tsx";
import { SystemPanel } from "./SystemPanel.tsx";
import { VoiceLab } from "./VoiceLab.tsx";
import { ApiError, api, getToken, setToken, type EpisodeRow } from "./api.ts";
import { Note, StatusPill, useNote } from "./ui.tsx";
import "./studio.css";

type Tab = "episodes" | "voices" | "system";
const FILTERS = [
  { key: "", label: "All" },
  { key: "chapter-pending", label: "Writing + voicing" },
  { key: "pending", label: "To render" },
  { key: "approved", label: "Approved" },
  { key: "posted", label: "Posted" },
  { key: "archived", label: "Archived" },
];

const readUrl = () => {
  const q = new URLSearchParams(location.search);
  return { tab: (q.get("tab") as Tab) || "episodes", id: q.get("id") };
};

export function Studio() {
  const [token, setTok] = useState(getToken());
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [{ tab, id }, setRoute] = useState(readUrl);
  const { note, say } = useNote();

  // keep tab + episode in the URL so a refresh or a shared link lands in the same place
  const go = useCallback((next: { tab: Tab; id: string | null }) => {
    const q = new URLSearchParams();
    if (next.tab !== "episodes") q.set("tab", next.tab);
    if (next.id) q.set("id", next.id);
    history.pushState(null, "", `${location.pathname}${q.size ? `?${q}` : ""}`);
    setRoute(next);
  }, []);
  useEffect(() => {
    const onPop = () => setRoute(readUrl());
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  const check = useCallback(async () => {
    if (!getToken()) { setAuthed(false); return; }
    try { await api("/api/me"); setAuthed(true); say("", ""); }
    catch (e) { setAuthed(false); say("err", e instanceof ApiError ? e.message : String(e)); }
  }, [say]);
  useEffect(() => { void check(); }, [check]);

  if (!authed) {
    return (
      <div className="shell" style={{ maxWidth: 480, paddingTop: 64 }}>
        <div className="card">
          <div className="brand">Banyan and Beyond<small>Ajja's story studio</small></div>
          <p className="muted">Enter the admin token to open the Studio.</p>
          <form onSubmit={(e) => { e.preventDefault(); setToken(token); void check(); }}>
            <input className="field" type="password" autoComplete="current-password" placeholder="admin token" value={token} onChange={(e) => setTok(e.target.value)} aria-label="Admin token" />
            <button className="btn primary" style={{ marginTop: 10, width: "100%" }} disabled={!token || authed === null}>Open Studio</button>
          </form>
          <div style={{ marginTop: 12 }}><Note note={note} /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">Banyan and Beyond<small>Ajja's story studio</small></div>
        <nav className="tabs" role="tablist">
          {(["episodes", "voices", "system"] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => go({ tab: t, id: null })}>
              {t === "episodes" ? "Episodes" : t === "voices" ? "Voice Lab" : "System"}
            </button>
          ))}
        </nav>
        <button className="btn tiny" onClick={() => { setToken(""); setTok(""); setAuthed(false); }}>Sign out</button>
      </header>
      {tab === "voices" ? <VoiceLab />
        : tab === "system" ? <SystemPanel />
        : id ? <EpisodeView id={id} onBack={() => go({ tab: "episodes", id: null })} />
        : <EpisodeList onOpen={(eid) => go({ tab: "episodes", id: eid })} />}
    </div>
  );
}

function EpisodeList({ onOpen }: { onOpen: (id: string) => void }) {
  const [episodes, setEpisodes] = useState<EpisodeRow[] | null>(null);
  const [filter, setFilter] = useState("");
  const { note, say } = useNote();

  const load = useCallback(async () => {
    try { setEpisodes(await api<EpisodeRow[]>("/api/episodes")); }
    catch (e) { say("err", e instanceof ApiError ? e.message : String(e)); }
  }, [say]);
  useEffect(() => { void load(); }, [load]);

  async function makeEpisode() {
    if (!window.confirm("Start a new episode outline now? The nightly cron scripts and voices it, about two weeks or more of nights.")) return;
    try {
      const r = await api<{ id: string }>("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      say("ok", `Outline ${r.id} created; the nightly cron (22:00 UTC) scripts and voices it.`);
      await load();
    } catch (e) { say("err", e instanceof ApiError ? e.message : String(e)); }
  }

  // archived episodes only show under their own filter
  const shown = (episodes ?? []).filter((e) => (filter ? e.status === filter : e.status !== "archived"));
  return (
    <>
      <div className="card">
        <div className="row spread">
          <div className="row" role="group" aria-label="Filter episodes">
            {FILTERS.map((f) => <button key={f.key} className={`btn tiny ${filter === f.key ? "primary" : ""}`} onClick={() => setFilter(f.key)}>{f.label}</button>)}
          </div>
          <div className="row">
            <button className="btn" onClick={() => void load()}>Refresh</button>
            <button className="btn primary" onClick={() => void makeEpisode()}>New story</button>
          </div>
        </div>
      </div>
      <Note note={note} />
      <div className="card">
        {episodes === null ? <p className="muted">Loading…</p>
          : shown.length === 0 ? <p className="muted">{episodes.length ? "No episodes with this status." : "No episodes yet. The nightly cron starts one, or press New story."}</p>
          : (
            <ul className="list">
              {shown.map((e) => (
                <li key={e.id}>
                  <button onClick={() => onOpen(e.id)}>
                    <span><b>{e.title}</b><br /><span className="small muted">{e.kind} · started {new Date(e.created_at).toLocaleDateString()}</span></span>
                    <StatusPill status={e.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
      </div>
    </>
  );
}
