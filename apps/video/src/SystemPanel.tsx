import { NIGHTLY_TTS_CHAR_BUDGET, type VoiceSettings } from "@banyan/core";
import { useCallback, useEffect, useState } from "react";
import { api } from "./api.ts";

declare const __BUILD__: { sha: string; at: string };

interface Me { ok: boolean; youtube: boolean; publicBase: string; crons: { voice: string; finalize: string }; nightlyCharBudget: number }
type Check = { label: string; state: "ok" | "warn" | "bad" | "wait"; detail: string };

const REPO = "https://github.com/drjzlyan/banyan-and-beyond";

/** Deploy + health at a glance: what is live, what is configured, what is left for the owner. */
export function SystemPanel() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    const out: Check[] = [];
    const t0 = performance.now();
    try {
      const h = await fetch("/health", { cache: "no-store" });
      out.push({ label: "Worker /health", state: h.ok ? "ok" : "bad", detail: h.ok ? `up · ${Math.round(performance.now() - t0)} ms` : `HTTP ${h.status}` });
    } catch (e) { out.push({ label: "Worker /health", state: "bad", detail: (e as Error).message }); }
    try {
      const me = await api<Me>("/api/me");
      out.push({ label: "Admin token", state: "ok", detail: "accepted" });
      out.push({ label: "YouTube OAuth secrets", state: me.youtube ? "ok" : "warn", detail: me.youtube ? "YT_CLIENT_ID / SECRET / REFRESH_TOKEN set" : "not set yet; uploads stay off (owner item 2–3)" });
      out.push({ label: "Crons", state: "ok", detail: `voice ${me.crons?.voice ?? "0 22 * * *"} UTC · YouTube finalize ${me.crons?.finalize ?? "*/10 * * * *"}` });
    } catch (e) { out.push({ label: "Admin token", state: "bad", detail: (e as Error).message }); }
    try {
      const s = await api<{ voices: VoiceSettings }>("/api/settings");
      out.push({ label: "Voices", state: "ok", detail: `Ajja ${s.voices.ajjaVoice} @ ${s.voices.ajjaPitch}× · Kid ${s.voices.kidVoice} @ ${s.voices.kidPitch}×` });
    } catch {
      out.push({ label: "Voices", state: "warn", detail: "settings API missing: the Worker is older than this Studio build; deploy main" });
    }
    out.push({ label: "Browser renderer", state: typeof VideoEncoder === "function" ? "ok" : "bad", detail: typeof VideoEncoder === "function" ? "WebCodecs available (Chrome/Edge desktop)" : "no WebCodecs: render in desktop Chrome" });
    setChecks(out);
    setBusy(false);
  }, []);

  useEffect(() => { void run(); }, [run]);

  const sha = typeof __BUILD__ !== "undefined" ? __BUILD__.sha : "dev";
  const at = typeof __BUILD__ !== "undefined" ? __BUILD__.at : "";

  return (
    <>
      <div className="card">
        <div className="row spread">
          <h2 style={{ margin: 0 }}>System</h2>
          <button className="btn" onClick={() => void run()} disabled={busy}>{busy ? "Checking…" : "Re-check"}</button>
        </div>
        <ul className="list" style={{ marginTop: 8 }}>
          {checks.map((c) => (
            <li key={c.label} className="row spread" style={{ padding: "10px 0" }}>
              <span>{c.label}</span>
              <span className="row"><span className="small muted">{c.detail}</span><span className={`pill ${c.state === "ok" ? "ok" : c.state === "warn" ? "warn" : "bad"}`}>{c.state === "ok" ? "OK" : c.state === "warn" ? "TODO" : "FAIL"}</span></span>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h3>Deploy</h3>
        <p className="small" style={{ marginTop: 0 }}>
          This Studio build: <span className="mono">{sha.slice(0, 7)}</span> {at && <span className="muted">built {new Date(at).toLocaleString()}</span>}
        </p>
        <p className="small muted">
          Deploys go through GitHub Actions only: merging to <span className="mono">main</span> runs tests, builds this Studio, deploys the Worker and uploads secrets. Nothing deploys from a laptop.
        </p>
        <div className="row">
          <a className="btn" href={`${REPO}/actions/workflows/deploy.yml`} target="_blank" rel="noreferrer">Deploy runs ↗</a>
          <a className="btn" href={`${REPO}/pulls`} target="_blank" rel="noreferrer">Pull requests ↗</a>
          <a className="btn" href={`${REPO}/commit/${sha}`} target="_blank" rel="noreferrer">This commit ↗</a>
        </div>
      </div>

      <div className="card">
        <h3>Free-tier budget</h3>
        <p className="small" style={{ marginTop: 0 }}>
          Aura-2 costs about 2,727 neurons per 1,000 characters, against 10,000 free neurons a day. The nightly cron voices at most {NIGHTLY_TTS_CHAR_BUDGET.toLocaleString()} characters, and Voice Lab previews come out of the same daily allowance.
          The first live chapter was 3,300 characters (two nights) and ran 3.9 minutes. At that size an 8-chapter episode is about 31 minutes and takes 16 nights.
          A true 1-hour episode needs chapters about twice as long, so roughly a month of nights per episode.
        </p>
      </div>
    </>
  );
}
