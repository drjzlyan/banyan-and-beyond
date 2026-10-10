import { useEffect, useState } from "react";

interface Episode { id: string; title: string; status: string; }

/** Minimal Studio: list episodes, trigger outline, per-chapter render comes in P3. */
export function Studio() {
  const [token, setToken] = useState("");
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [msg, setMsg] = useState("");

  const headers = () => ({ "x-admin-token": token, "content-type": "application/json" });

  async function load() {
    setMsg("");
    try {
      const r = await fetch("/api/episodes", { headers: { "x-admin-token": token } });
      if (!r.ok) { setMsg(`list failed: ${r.status}`); return; }
      setEpisodes(await r.json());
    } catch (e) { setMsg(String(e)); }
  }

  async function makeEpisode() {
    const r = await fetch("/api/run", { method: "POST", headers: headers(), body: "{}" });
    setMsg(r.ok ? "outline started" : `run failed: ${r.status}`);
    if (r.ok) void load();
  }

  useEffect(() => { if (token) void load(); }, [token]);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <h1>Banyan and Beyond — Studio</h1>
      <p>Ajja's story studio. One episode = 8 chapters ≈ 1 hour, built over ~2 weeks on the free tier.</p>
      <input placeholder="admin token" value={token} onChange={(e) => setToken(e.target.value)} style={{ width: "100%", padding: 12, fontSize: 16 }} />
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={load} style={{ padding: "12px 18px" }}>Refresh</button>
        <button onClick={makeEpisode} style={{ padding: "12px 18px" }}>Make an episode now</button>
      </div>
      {msg && <p>{msg}</p>}
      <ul>
        {episodes.map((e) => (
          <li key={e.id}><b>{e.title}</b> — {e.status}</li>
        ))}
      </ul>
    </div>
  );
}
