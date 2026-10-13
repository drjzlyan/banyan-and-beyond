import { AURA2_VOICES, PITCH_MAX, PITCH_MIN, type VoiceSettings } from "@banyan/core";
import { useEffect, useRef, useState } from "react";
import { ApiError, api, getToken } from "./api.ts";
import { Note, useNote, usePlayer } from "./ui.tsx";

/** Aura-2 voices Deepgram presents as masculine; the rest are feminine. A hint only — trust your ear. */
const MASCULINE = new Set(["apollo", "arcas", "aries", "atlas", "draco", "hermes", "hyperion", "jupiter", "mars", "neptune", "odysseus", "orion", "orpheus", "pluto", "saturn", "zeus"]);
const SHORTLIST = {
  AJJA: ["pluto", "mars", "odysseus", "zeus", "arcas", "orion"],
  KID: ["luna", "aurora", "phoebe", "iris", "thalia", "cora"],
};
const SAMPLES = {
  AJJA: "Come, sit close to me under the old banyan tree, and I will tell you a story about a very honest farmer.",
  KID: "But Ajja, why did the farmer give back the gold coin? Was he not a little bit sad?",
};

type Role = "AJJA" | "KID";

export function VoiceLab({ onSaved }: { onSaved?: (v: VoiceSettings) => void }) {
  const [saved, setSaved] = useState<VoiceSettings | null>(null);
  const [draft, setDraft] = useState<VoiceSettings | null>(null);
  const { note, say } = useNote();

  useEffect(() => {
    api<{ voices: VoiceSettings }>("/api/settings").then((r) => { setSaved(r.voices); setDraft(r.voices); }).catch((e) => say("err", String(e)));
  }, [say]);

  async function save() {
    if (!draft) return;
    try {
      const r = await api<{ voices: VoiceSettings }>("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ voices: draft }) });
      setSaved(r.voices); setDraft(r.voices); onSaved?.(r.voices);
      say("ok", "Saved. New voices apply to lines voiced from tonight on. Pitch applies to every render from now on. Use \"Re-voice\" on a chapter to redo it in the new voice.");
    } catch (e) { say("err", e instanceof ApiError ? e.message : String(e)); }
  }

  if (!draft || !saved) return <div className="card">Loading voice settings… <Note note={note} /></div>;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const voiceChanged = draft.ajjaVoice !== saved.ajjaVoice || draft.kidVoice !== saved.kidVoice;

  return (
    <>
      <div className="card">
        <h2>Voice Lab</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Pick an Aura-2 voice and a pitch for Ajja and the Kid. <b>Preview</b> speaks the sample through Workers AI. Each sample uses a few hundred neurons from the same 10k/day free allowance as the nightly voicing, so keep previews to a handful a day. The pitch slider changes playback live without spending any.
        </p>
        <Note note={note} />
        <div className="row">
          <button className="btn primary" disabled={!dirty} onClick={() => void save()}>Save voices</button>
          <button className="btn" disabled={!dirty} onClick={() => setDraft(saved)}>Undo changes</button>
          {voiceChanged && <span className="pill warn">voice change: chapters already voiced keep the old voice until re-voiced</span>}
        </div>
      </div>
      <div className="grid2">
        <RoleCard role="AJJA" title="Ajja (grandfather)" voice={draft.ajjaVoice} pitch={draft.ajjaPitch}
          onVoice={(v) => setDraft({ ...draft, ajjaVoice: v })} onPitch={(p) => setDraft({ ...draft, ajjaPitch: p })} say={say} />
        <RoleCard role="KID" title="Kid (grandchild)" voice={draft.kidVoice} pitch={draft.kidPitch}
          onVoice={(v) => setDraft({ ...draft, kidVoice: v })} onPitch={(p) => setDraft({ ...draft, kidPitch: p })} say={say} />
      </div>
    </>
  );
}

function RoleCard(props: {
  role: Role; title: string; voice: string; pitch: number;
  onVoice: (v: string) => void; onPitch: (p: number) => void; say: (k: "ok" | "err" | "info", t: string) => void;
}) {
  const { role, voice, pitch } = props;
  const [text, setText] = useState(SAMPLES[role]);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const cache = useRef(new Map<string, string>());
  const player = usePlayer();
  const id = `${role}-sample`;

  const { setRate } = player;
  useEffect(() => { setRate(pitch); }, [pitch, setRate]);

  async function preview() {
    const key = `${voice}|${text}`;
    let url = cache.current.get(key);
    if (!url) {
      setBusy(true);
      try {
        const res = await fetch("/api/voice-preview", { method: "POST", headers: { "content-type": "application/json", "x-admin-token": getToken() }, body: JSON.stringify({ voice, text }) });
        if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `HTTP ${res.status}`);
        url = URL.createObjectURL(await res.blob());
        cache.current.set(key, url);
      } catch (e) { props.say("err", `Preview failed: ${(e as Error).message}`); return; } finally { setBusy(false); }
    }
    player.play(id, url, pitch);
  }

  const voices = showAll ? AURA2_VOICES : SHORTLIST[role];
  return (
    <div className="card">
      <div className="row spread"><h3>{props.title}</h3><span className="pill ok">{voice} · {pitch.toFixed(2)}×</span></div>
      <div className="voices" role="group" aria-label={`${props.title} voice`}>
        {voices.map((v) => (
          <button key={v} aria-pressed={v === voice} onClick={() => props.onVoice(v)}>
            {v}<span className="g">{MASCULINE.has(v) ? "masculine" : "feminine"}</span>
          </button>
        ))}
      </div>
      <button className="btn tiny" style={{ marginTop: 8 }} onClick={() => setShowAll(!showAll)}>
        {showAll ? "Show suggested only" : `Show all ${AURA2_VOICES.length} voices`}
      </button>
      <label className="small" style={{ display: "block", marginTop: 12 }}>
        Pitch / pace <b>{pitch.toFixed(2)}×</b> <span className="muted">(below 1 is deeper and slower, above 1 is higher and faster)</span>
        <input type="range" min={PITCH_MIN} max={PITCH_MAX} step={0.05} value={pitch} onChange={(e) => props.onPitch(Number(e.target.value))} />
      </label>
      <label className="small" style={{ display: "block", marginTop: 8 }}>
        Sample line (300 characters max)
        <textarea className="field" rows={3} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="row" style={{ marginTop: 8 }}>
        {player.playing === id
          ? <button className="btn" onClick={player.stop}>■ Stop</button>
          : <button className="btn primary" disabled={busy || !text.trim()} onClick={() => void preview()}>{busy ? "Speaking…" : `▶ Preview ${voice}`}</button>}
        <span className="small muted">Replays of the same voice and text are free (cached).</span>
      </div>
    </div>
  );
}
