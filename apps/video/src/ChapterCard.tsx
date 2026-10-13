import { TARGET_CHAPTER_SECONDS, analyzeChapter, isChapterVoiced, parseScript, type VoiceSettings } from "@banyan/core";
import { useMemo, useState } from "react";
import type { ChapterRow } from "./api.ts";
import { StatusPill, fmtMin, usePlayer } from "./ui.tsx";

interface StoredClip { speaker: "AJJA" | "KID"; text: string; duration: number; url: string; voice?: string }

/** One chapter: health analysis, line-by-line listening at the chosen pitch, and its actions. */
export function ChapterCard(props: {
  row: ChapterRow;
  voices: VoiceSettings;
  locked: boolean;
  phase?: string;
  pct?: number;
  onRender: () => void;
  onPreview: () => void;
  onRegenerate: () => void;
  onRevoice: () => void;
}) {
  const { row, voices } = props;
  const [open, setOpen] = useState(false);
  const player = usePlayer();
  const clips = useMemo(() => JSON.parse(row.clips_json || "[]") as StoredClip[], [row.clips_json]);
  const a = useMemo(() => analyzeChapter(row.spoken, {
    clipDurations: clips.map((c) => ({ speaker: c.speaker, duration: c.duration })),
    ajjaPitch: voices.ajjaPitch, kidPitch: voices.kidPitch, finalChapter: row.idx === 7,
  }), [row.spoken, row.idx, clips, voices.ajjaPitch, voices.kidPitch]);
  // storytelling gaps show as chips below, not again as warning lines
  const warnings = a.warnings.filter((w) => !w.startsWith("storytelling:"));
  const voiced = isChapterVoiced(row.status);
  // script rows in order; sound cues sit between spoken lines, and clips index spoken lines only
  const rows = (() => {
    let n = 0;
    return parseScript(row.spoken ?? "").map((it) => (it?.kind === "line" ? { ...it, n: n++ } : it));
  })();
  // clips voiced before the Voice Lab carry no voice field; they were all Luna
  const oldVoices = [...new Set(clips.map((c) => c.voice ?? "luna"))]
    .filter((v) => v !== voices.ajjaVoice && v !== voices.kidVoice);
  const rate = (s: string) => (s === "KID" ? voices.kidPitch : voices.ajjaPitch);

  function playFrom(i: number) {
    const c = clips[i];
    if (!c) return;
    player.play(`l${i}`, c.url, rate(c.speaker), () => playFrom(i + 1));
  }

  const phaseLabel = props.phase === "preparing" ? "Preparing audio…" : props.phase === "rendering" ? `Rendering ${Math.round((props.pct ?? 0) * 100)}%` : props.phase === "uploading" ? `Uploading ${Math.round((props.pct ?? 0) * 100)}%` : null;

  return (
    <div className="card">
      <div className="row spread">
        <h3 style={{ margin: 0 }}>Chapter {row.idx + 1}</h3>
        <div className="row">
          {/* legacy rows say "rendered" once voiced; only a video makes a chapter truly rendered */}
          <StatusPill status={row.status === "rendered" && !row.video_key ? "voiced" : row.status} chapter />
          {row.video_key && <span className="pill ok">video ✓</span>}
        </div>
      </div>

      {!row.spoken ? (
        <p className="muted small">Not scripted yet. The nightly cron (22:00 UTC) scripts and voices chapters in order, about one chapter every two nights.</p>
      ) : (
        <>
          <div className="stats">
            <div className="stat"><b>{fmtMin(a.pitchedSeconds)}</b><span>{a.secondsEstimated ? "est. length" : "length at your pitch"} · target {fmtMin(TARGET_CHAPTER_SECONDS)}</span></div>
            <div className="stat"><b>{a.words}</b><span>words · {a.lines} lines</span></div>
            <div className="stat"><b>{a.ajjaLines} / {a.kidLines}</b><span>Ajja / Kid lines</span></div>
            <div className="stat"><b>{clips.length}/{a.lines}</b><span>lines voiced</span></div>
            <div className="stat"><b>{a.sfx}</b><span>sound effects · {a.avgLineWords.toFixed(1)} words/line</span></div>
            <div className="stat"><b>{a.nightsToVoice}</b><span>nights to voice ({a.ttsChars} chars)</span></div>
          </div>
          <div className="bar" aria-label="voicing progress"><i style={{ width: `${a.lines ? (clips.length / a.lines) * 100 : 0}%` }} /></div>
          {a.craft.length > 0 && (
            <div className="row small" style={{ marginTop: 10, flexWrap: "wrap", gap: 6 }} aria-label="storytelling checklist">
              <span className="muted">Storytelling:</span>
              {a.craft.map((c) => <span key={c.label} className={`pill ${c.ok ? "ok" : "warn"}`} title={c.hint}>{c.ok ? "✓" : "✗"} {c.label}</span>)}
            </div>
          )}
          {(a.problems.length > 0 || warnings.length > 0 || oldVoices.length > 0) && (
            <ul className="small" style={{ margin: "10px 0 0", paddingLeft: 18 }}>
              {a.problems.map((p) => <li key={p} style={{ color: "var(--bad)" }}>{p}</li>)}
              {warnings.map((w) => <li key={w} style={{ color: "var(--warn)" }}>{w}</li>)}
              {oldVoices.length > 0 && <li style={{ color: "var(--warn)" }}>voiced with {oldVoices.join(", ")}, which isn't a current voice; use Re-voice to match</li>}
            </ul>
          )}
        </>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={props.onRender} disabled={!!props.phase || !voiced || props.locked}
          title={voiced ? "Render this chapter in your browser and upload the MP4" : "Wait until the chapter is fully voiced"}>
          {phaseLabel ?? (row.video_key ? "Re-render" : "Render + upload")}
        </button>
        <button className="btn" onClick={props.onPreview} disabled={!!props.phase || !voiced} title="Watch it with sound effects and animation, without rendering">▶ Preview video</button>
        {clips.length > 0 && (player.playing
          ? <button className="btn" onClick={player.stop}>■ Stop</button>
          : <button className="btn" onClick={() => playFrom(0)}>♪ Listen</button>)}
        {rows.length > 0 && <button className="btn" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Hide script" : "Script"}</button>}
        <button className="btn" disabled={props.locked || !voiced} onClick={props.onRevoice} title="Same script, current voices">Re-voice</button>
        <button className="btn danger" disabled={props.locked} onClick={props.onRegenerate}>New script</button>
      </div>

      {open && (
        <ol className="script">
          {rows.map((it, i) => {
            if (!it) return <li key={i}><span /><span className="who">?</span><span className="small" style={{ color: "var(--bad)" }}>unreadable row</span></li>;
            if (it.kind === "sfx") return <li key={i} className="sfx"><span /><span className="who">SFX</span><span className="small muted">♪ {it.id}</span></li>;
            const id = `l${it.n}`;
            const c = clips[it.n];
            return (
              <li key={i} className={`${player.playing === id ? "playing" : ""} ${a.hookLines.includes(it.n + 1) ? "hook" : ""}`}>
                <button className="btn tiny" aria-label={`Play line ${it.n + 1}`} disabled={!c}
                  onClick={() => (player.playing === id ? player.stop() : player.play(id, c.url, rate(c.speaker)))}>
                  {player.playing === id ? "■" : "▶"}
                </button>
                <span className={`who ${it.speaker}`}>{it.speaker === "AJJA" ? "Ajja" : "Kid"}</span>
                <span>{it.text}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
