import { AJJA_PITCH, CHAPTER_VIDEO_BITRATE, KID_PITCH, MAX_CHAPTER_VIDEO_BYTES, isChapterVoiced, type PreparedClip } from "@banyan/core";
import { renderMediaOnWeb, renderStillOnWeb } from "@remotion/web-renderer";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BanyanVideo } from "./BanyanVideo.tsx";
import { Thumbnail } from "./Thumbnail.tsx";
import { ApiError, api, getToken, putFile, setToken, type ChapterRow, type EpisodeDetail, type EpisodeRow } from "./api.ts";
import { FPS, mouthEnvelope, pitchClips } from "./audio.ts";
import { assembleEpisode, resumableUpload, uploadThumbnail, type UploadSession } from "./publish.ts";

const THEME_COLORS: Record<string, string> = {
  honesty: "#e4e9f7", kindness: "#f7e4e4", duty: "#e6e0d2", courage: "#ffe9c4",
  respect: "#dff0e4", sharing: "#efe4f7", cleanliness: "#e0f2f2", gratitude: "#fff3d6",
};

function useNote() {
  const [note, setNote] = useState<{ kind: string; text: string } | null>(null);
  const say = useCallback((kind: string, text: string) => setNote({ kind, text }), []);
  return { note, say };
}

export function Studio() {
  const [token, setTok] = useState(getToken());
  const [episodes, setEpisodes] = useState<EpisodeRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(new URLSearchParams(location.search).get("id"));
  const { note, say } = useNote();

  const load = useCallback(async () => {
    try {
      setEpisodes(await api<EpisodeRow[]>("/api/episodes"));
      say("", "");
    } catch (e) { say("err", e instanceof ApiError ? e.message : String(e)); }
  }, [say]);

  useEffect(() => { if (token) void load(); }, [token, load]);

  const saveToken = (t: string) => { setTok(t); setToken(t); };

  async function makeEpisode() {
    try {
      const r = await api<{ id: string }>("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      say("ok", `Outline ${r.id} started — the nightly cron scripts and voices it.`);
      await load();
    } catch (e) { say("err", e instanceof ApiError ? e.message : String(e)); }
  }

  if (openId) return <EpisodeView id={openId} onBack={() => { setOpenId(null); void load(); }} />;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <h1>Banyan and Beyond — Studio</h1>
      <p>Ajja's story studio. One episode = 8 chapters ≈ 1 hour, voiced over ~2 weeks on the free tier.</p>
      <input placeholder="admin token" value={token} onChange={(e) => saveToken(e.target.value)} style={{ width: "100%", padding: 12, fontSize: 16 }} />
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={() => void load()} style={{ padding: "12px 18px" }}>Refresh</button>
        <button onClick={() => void makeEpisode()} style={{ padding: "12px 18px" }}>Make an episode now</button>
      </div>
      {note?.text && <p>{note.text}</p>}
      <ul>
        {episodes.map((e) => (
          <li key={e.id}><button onClick={() => setOpenId(e.id)} style={{ fontSize: 16 }}><b>{e.title}</b> — {e.status}</button></li>
        ))}
      </ul>
    </div>
  );
}

function EpisodeView({ id, onBack }: { id: string; onBack: () => void }) {
  const [detail, setDetail] = useState<EpisodeDetail | null>(null);
  const [full, setFull] = useState<Record<number, ChapterRow>>({});
  const [phase, setPhase] = useState<Record<number, string>>({});
  const [pct, setPct] = useState<Record<number, number>>({});
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [yt, setYt] = useState<UploadSession | null>(null);
  const [pubPhase, setPubPhase] = useState("");
  const [pubPct, setPubPct] = useState(0);
  const { note, say } = useNote();

  const reload = useCallback(async () => {
    const d = await api<EpisodeDetail>(`/api/episodes/${id}`);
    setDetail(d);
    // an upload session (and its token) is only valid while the episode stays approved
    if (d.status !== "approved") setYt(null);
    return d;
  }, [id]);

  useEffect(() => { reload().catch((e) => say("err", String(e))); }, [reload, say]);

  const themeColor = useMemo(() => THEME_COLORS[detail?.outline.theme.id ?? ""] ?? "#ffe9c4", [detail]);
  const moral = detail?.outline.theme.moral ?? "";

  // always refetch: a regenerated chapter must never render from a stale script
  async function loadChapter(n: number) {
    const rows = await api<ChapterRow[]>(`/api/episodes/${id}/chapters`);
    const map: Record<number, ChapterRow> = {};
    for (const r of rows) map[r.idx] = r;
    setFull(map);
    const row = map[n];
    if (!row) throw new Error(`chapter ${n} not found`);
    return row;
  }

  async function renderChapter(n: number) {
    setPhase((p) => ({ ...p, [n]: "preparing" }));
    try {
      const row = await loadChapter(n);
      const stored = JSON.parse(row.clips_json || "[]") as PreparedClip[];
      if (!isChapterVoiced(row.status) || !stored.length) { say("err", `Chapter ${n + 1} is not fully voiced yet — the nightly cron is still working.`); setPhase((p) => ({ ...p, [n]: "" })); return; }
      const pitched = await pitchClips(stored, AJJA_PITCH, KID_PITCH);
      const mouth = await mouthEnvelope(pitched.clips, pitched.duration);
      const props = { title: row.title, themeColor, moral, clips: pitched.clips, duration: pitched.duration, mouth };
      const frames = Math.ceil(pitched.duration * FPS) + 20;
      setPhase((p) => ({ ...p, [n]: "rendering" }));
      const started = Date.now();
      const { getBlob } = await renderMediaOnWeb({
        composition: { id: "banyan-ch", component: BanyanVideo, durationInFrames: frames, fps: FPS, width: 1280, height: 720, defaultProps: props },
        inputProps: props,
        container: "mp4", videoCodec: "h264", audioCodec: "aac",
        videoBitrate: CHAPTER_VIDEO_BITRATE,
        onProgress: ({ progress: p }) => {
          setPct((x) => ({ ...x, [n]: p }));
          void started;
        },
      });
      const blob = await getBlob();
      if (blob.size > MAX_CHAPTER_VIDEO_BYTES) throw new Error(`video is ${(blob.size / 1e6).toFixed(0)} MB; the free plan accepts under ${MAX_CHAPTER_VIDEO_BYTES / 1e6} MB per upload`);
      setPhase((p) => ({ ...p, [n]: "uploading" }));
      // the real rendered length (pitch shift + tail) drives the YouTube chapter timestamps
      await putFile(`/api/episodes/${id}/chapters/${n}/video`, blob, "video/mp4", (f) => setPct((x) => ({ ...x, [n]: f })), { "x-video-duration": (frames / FPS).toFixed(2) });
      await reload();
      say("ok", `Chapter ${n + 1} rendered (${(blob.size / 1e6).toFixed(1)} MB) and uploaded.`);
      setPhase((p) => ({ ...p, [n]: "" }));
    } catch (e) { setPhase((p) => ({ ...p, [n]: "" })); say("err", `Chapter ${n + 1}: ${(e as Error).message}`); }
  }

  async function renderThumbnail() {
    if (!detail) return;
    try {
      say("", "Drawing thumbnail…");
      const count = (await api<EpisodeRow[]>("/api/episodes")).findIndex((e) => e.id === id);
      const props = { title: detail.title, valueWord: detail.outline.theme.valueWord, episodeNo: Math.max(1, count + 1) };
      const still = await renderStillOnWeb({
        composition: { id: "banyan-thumb", component: Thumbnail, durationInFrames: 30, fps: FPS, width: 1280, height: 720, defaultProps: props },
        frame: 0,
        inputProps: props,
      });
      const blob = await still.blob({ format: "jpeg", quality: 0.92 });
      await putFile(`/api/episodes/${id}/thumbnail`, blob, "image/jpeg", () => null);
      setThumbUrl(URL.createObjectURL(blob));
      await reload();
      say("ok", "Thumbnail uploaded.");
    } catch (e) { say("err", `Thumbnail: ${(e as Error).message}`); }
  }

  async function setStatus(status: string) {
    try {
      await api(`/api/episodes/${id}/status`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
      await reload(); say("ok", `Episode marked ${status}.`);
    } catch (e) { say("err", e instanceof ApiError ? e.message : String(e)); }
  }

  async function regen(n: number) {
    if (!window.confirm(`Re-script and re-voice chapter ${n + 1}? Its script, voice and video are deleted now, and the episode needs approving again.`)) return;
    try {
      await api(`/api/episodes/${id}/chapters/${n}/regenerate`, { method: "POST" });
      setFull({});
      await reload();
      say("ok", `Chapter ${n + 1} will be re-made on the nightly cron.`);
    } catch (e) { say("err", e instanceof ApiError ? e.message : String(e)); }
  }

  async function ytInfo() {
    try {
      const r = await api<UploadSession>(`/api/episodes/${id}/upload-url`, { method: "POST" });
      setYt(r); say("", "");
    } catch (e) { say("err", e instanceof ApiError ? e.message : String(e)); }
  }

  async function publish() {
    if (!yt) return;
    if ((await reload()).status !== "approved") { say("err", "The episode is no longer approved; approve it again before publishing."); return; }
    if (!window.confirm("Assemble the 8 chapters and upload to YouTube as unlisted? This takes a while — keep this tab in the foreground.")) return;
    try {
      setPubPhase("assembling");
      const file = await assembleEpisode(yt.parts, (stage, f) => { setPubPhase(stage); setPubPct(f * 0.3); });
      setPubPhase("uploading");
      const videoId = await resumableUpload(yt, file, (f) => setPubPct(0.3 + f * 0.65));
      setPubPhase("thumbnail");
      await uploadThumbnail(yt, videoId);
      await api(`/api/episodes/${id}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ytVideoId: videoId }) });
      setPubPct(1); setPubPhase("");
      await reload();
      say("ok", `Uploaded (YouTube id ${videoId}). The 10-minute cron marks it posted once processing finishes.`);
    } catch (e) { setPubPhase(""); say("err", `Publish: ${(e as Error).message}`); }
  }

  if (!detail) return <div style={{ padding: 16 }}>Loading… {note?.text}</div>;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <button onClick={onBack}>← All episodes</button>
      <h2>{detail.title} — {detail.status}</h2>
      <p>Moral: {moral}</p>
      {detail.yt_upload && <p>YouTube: {detail.yt_upload.status}{detail.yt_upload.yt_video_id ? ` (${detail.yt_upload.yt_video_id})` : ""}{detail.yt_upload.error ? ` — ${detail.yt_upload.error}` : ""}</p>}
      {note?.text && <p>{note.text}</p>}
      <ol>
        {detail.chapters.map((c) => (
          <li key={c.idx} style={{ marginBottom: 10 }}>
            <b>Ch {c.idx + 1}: {c.title}</b> — {c.status}
            {c.duration > 0 && ` (${Math.round(c.duration)}s)`}
            {c.video_key && " · video ✓"}
            <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
              <button onClick={() => void renderChapter(c.idx)} disabled={!!phase[c.idx] || !isChapterVoiced(c.status)} style={{ padding: "10px 14px" }}>
                {phase[c.idx] === "preparing" ? "Preparing audio…" : phase[c.idx] === "rendering" ? `Rendering ${Math.round((pct[c.idx] ?? 0) * 100)}%` : phase[c.idx] === "uploading" ? "Uploading…" : "Render + upload"}
              </button>
              <button onClick={() => void regen(c.idx)} style={{ padding: "10px 14px" }}>New script</button>
              {full[c.idx] && <span style={{ fontSize: 13 }}>{JSON.parse(full[c.idx].clips_json || "[]").length} clips voiced</span>}
            </div>
          </li>
        ))}
      </ol>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <button onClick={() => void renderThumbnail()} style={{ padding: "12px 18px" }}>Render + upload thumbnail</button>
        {detail.status === "approved"
          ? <button onClick={() => void setStatus("pending")} style={{ padding: "12px 18px" }}>Un-approve</button>
          : <button onClick={() => void setStatus("approved")} style={{ padding: "12px 18px" }}>Approve episode</button>}
        <button onClick={() => void ytInfo()} disabled={detail.status !== "approved"} style={{ padding: "12px 18px" }}>YouTube info</button>
      </div>
      {thumbUrl && <div><p>Thumbnail preview:</p><img src={thumbUrl} alt="thumbnail" style={{ width: "100%" }} /></div>}
      {yt && (
        <div style={{ marginTop: 12, background: "#f4f1e6", padding: 12 }}>
          <p><b>{yt.title}</b></p>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{yt.description}</pre>
          <p>{yt.parts.length} chapters ready · thumbnail {yt.thumbnailUrl ? "ready" : "missing — render it above first"}</p>
          <button onClick={() => void publish()} disabled={!!pubPhase || detail.status !== "approved"} style={{ padding: "12px 18px" }}>
            {pubPhase ? `${pubPhase} ${Math.round(pubPct * 100)}%` : "Assemble + upload to YouTube (unlisted)"}
          </button>
        </div>
      )}
    </div>
  );
}
