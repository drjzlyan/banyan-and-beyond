import { CHAPTER_VIDEO_BITRATE, DEFAULT_VOICE_SETTINGS, TARGET_EPISODE_SECONDS, castVoice, chapterRole, endsWithLesson, opensWithJingle, sfxCues, withBookends, MAX_CHAPTER_VIDEO_BYTES, analyzeChapter, isChapterVoiced, type PreparedClip, type VoiceSettings } from "@banyan/core";
import { renderMediaOnWeb, renderStillOnWeb } from "@remotion/web-renderer";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Player } from "@remotion/player";
import { BanyanVideo, type BanyanVideoProps } from "./BanyanVideo.tsx";
import { ChapterCard } from "./ChapterCard.tsx";
import { Thumbnail } from "./Thumbnail.tsx";
import { ApiError, api, putFile, type ChapterRow, type EpisodeDetail, type EpisodeRow } from "./api.ts";
import { FPS, mouthEnvelope, pitchClips } from "./audio.ts";
import { BED_SECONDS, JINGLE_SECONDS, bedUrl, jingleUrl, uiSoundUrl } from "./jingle.ts";
import { AMBIENCE_SECONDS, ambienceUrl, sfx } from "./sfx.ts";
import { assembleEpisode, resumableUpload, uploadThumbnail, type UploadSession } from "./publish.ts";
import { Note, StatusPill, fmtMin, useNote } from "./ui.tsx";

const THEME_COLORS: Record<string, string> = {
  honesty: "#e4e9f7", kindness: "#f7e4e4", duty: "#e6e0d2", courage: "#ffe9c4",
  respect: "#dff0e4", sharing: "#efe4f7", cleanliness: "#e0f2f2", gratitude: "#fff3d6",
};

const STEPS = ["Writing + voicing", "Render", "Thumbnail", "Approve", "Upload", "Posted"] as const;

export function EpisodeView({ id, onBack }: { id: string; onBack: () => void }) {
  const [detail, setDetail] = useState<EpisodeDetail | null>(null);
  const [rows, setRows] = useState<ChapterRow[]>([]);
  const [voices, setVoices] = useState<VoiceSettings>(DEFAULT_VOICE_SETTINGS);
  const [phase, setPhase] = useState<Record<number, string>>({});
  const [pct, setPct] = useState<Record<number, number>>({});
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [yt, setYt] = useState<UploadSession | null>(null);
  const [pubPhase, setPubPhase] = useState("");
  const [pubPct, setPubPct] = useState(0);
  const [preview, setPreview] = useState<{ n: number; props: BanyanVideoProps; frames: number } | null>(null);
  const { note, say } = useNote();

  const reload = useCallback(async () => {
    const [d, r] = await Promise.all([api<EpisodeDetail>(`/api/episodes/${id}`), api<ChapterRow[]>(`/api/episodes/${id}/chapters`)]);
    setDetail(d); setRows(r);
    // an upload session (and its token) is only valid while the episode stays approved
    if (d.status !== "approved") setYt(null);
    return d;
  }, [id]);

  useEffect(() => {
    reload().catch((e) => say("err", String(e)));
    api<{ voices: VoiceSettings }>("/api/settings").then((r) => setVoices(r.voices)).catch(() => undefined);
  }, [reload, say]);

  const themeColor = useMemo(() => THEME_COLORS[detail?.outline.theme.id ?? ""] ?? "#ffe9c4", [detail]);
  const moral = detail?.outline.theme.moral ?? "";
  const locked = detail?.status === "uploading" || detail?.status === "posted" || detail?.status === "archived";
  const plan = detail?.outline.plan ?? null;
  const single = rows.length === 1;
  const castPitch = useMemo(() => Object.fromEntries((plan?.cast ?? []).map((c) => [c.id, castVoice(c.kind, voices).pitch])), [plan, voices]);

  const totals = useMemo(() => {
    let seconds = 0, voicedLines = 0, lines = 0, estimated = false;
    for (const r of rows) {
      if (!r.spoken) { estimated = true; continue; }
      const clips = JSON.parse(r.clips_json || "[]") as { speaker: string; duration: number; pitch?: number }[];
      const a = analyzeChapter(r.spoken, { clipDurations: clips, ajjaPitch: voices.ajjaPitch, kidPitch: voices.kidPitch, finalChapter: r.idx === rows.length - 1, castPitch });
      seconds += a.pitchedSeconds; voicedLines += Math.min(clips.length, a.lines); lines += a.lines;
      if (a.secondsEstimated) estimated = true;
    }
    const scripted = rows.filter((r) => r.spoken).length;
    const projected = scripted ? (seconds / scripted) * rows.length : 0;
    return { seconds, projected, voicedLines, lines, estimated, scripted,
      voicedChapters: rows.filter((r) => isChapterVoiced(r.status)).length,
      renderedChapters: rows.filter((r) => r.video_key).length };
  }, [rows, voices, castPitch]);

  const step = !detail ? 0
    : detail.status === "posted" ? 5
    : detail.status === "uploading" ? 4
    : detail.status === "approved" ? 3
    : totals.voicedChapters < rows.length ? 0
    : totals.renderedChapters < rows.length ? 1
    : !detail.thumbnail_key ? 2 : 3;

  /** Pitch the voices, place and synthesize the sound cues, and build the composition props. */
  async function prepareChapter(n: number): Promise<{ props: BanyanVideoProps; frames: number }> {
    const fresh = await api<ChapterRow[]>(`/api/episodes/${id}/chapters`);
    const row = fresh.find((r) => r.idx === n);
    if (!row) throw new Error(`chapter ${n + 1} not found`);
    const stored = JSON.parse(row.clips_json || "[]") as PreparedClip[];
    if (!isChapterVoiced(row.status) || !stored.length) throw new Error("not fully voiced yet — the nightly cron is still working");
    // story characters' clips carry their pitch; older clips fall back to their kind's current pitch
    const withPitch = stored.map((c) => (c.speaker === "AJJA" || c.speaker === "KID" || c.pitch ? c : { ...c, pitch: castPitch[c.speaker] ?? 1 }));
    const pitched = await pitchClips(withPitch, voices.ajjaPitch, voices.kidPitch, sfxCues(row.spoken));
    // bookends: brand jingle (a story, or chapter 1) or a sting before the first line; the lesson + outro (or cliffhanger room) after the last
    const count = fresh.length || 1;
    const role = chapterRole(n, count);
    const timed = withBookends(pitched.clips, pitched.cues, pitched.duration, role);
    const mouth = await mouthEnvelope(timed.clips, timed.duration);
    const cues = await Promise.all(timed.cues.map(async (c) => ({ ...c, ...(await sfx(c.id)) })));
    const cut = opensWithJingle(role) ? "intro" : "sting";
    const props: BanyanVideoProps = {
      title: row.title, episodeTitle: detail?.title, chapterNo: count > 1 ? n + 1 : undefined, chapterCount: count, themeColor, moral,
      cast: plan?.cast.map((c) => ({ id: c.id, name: c.name, kind: c.kind })) ?? [],
      clips: timed.clips, duration: timed.duration, mouth, cues, ambienceUrl: await ambienceUrl(), ambienceSeconds: AMBIENCE_SECONDS,
      role, intro: timed.intro, outro: timed.outro,
      jingleUrl: await jingleUrl(cut), jingleSeconds: JINGLE_SECONDS[cut],
      ...(endsWithLesson(role) ? { outroJingleUrl: await jingleUrl("outro"), outroJingleSeconds: JINGLE_SECONDS.outro } : {}),
      bedUrl: await bedUrl(), bedSeconds: BED_SECONDS,
      ui: { pop: await uiSoundUrl("pop"), sparkle: await uiSoundUrl("sparkle"), whoosh: await uiSoundUrl("whoosh") },
    };
    // frames (and so x-video-duration and the YouTube chapter stamps) include the bookends
    return { props, frames: Math.ceil(timed.duration * FPS) };
  }

  async function previewChapter(n: number) {
    setPhase((p) => ({ ...p, [n]: "preparing" }));
    try { setPreview({ n, ...(await prepareChapter(n)) }); }
    catch (e) { say("err", `Chapter ${n + 1}: ${(e as Error).message}`); } finally { setPhase((p) => ({ ...p, [n]: "" })); }
  }

  async function renderChapter(n: number) {
    setPhase((p) => ({ ...p, [n]: "preparing" }));
    try {
      const { props, frames } = await prepareChapter(n);
      setPhase((p) => ({ ...p, [n]: "rendering" }));
      const { getBlob } = await renderMediaOnWeb({
        composition: { id: "banyan-ch", component: BanyanVideo, durationInFrames: frames, fps: FPS, width: 1280, height: 720, defaultProps: props },
        inputProps: props,
        container: "mp4", videoCodec: "h264", audioCodec: "aac",
        videoBitrate: CHAPTER_VIDEO_BITRATE,
        onProgress: ({ progress }) => setPct((x) => ({ ...x, [n]: progress })),
      });
      const blob = await getBlob();
      if (blob.size > MAX_CHAPTER_VIDEO_BYTES) throw new Error(`video is ${(blob.size / 1e6).toFixed(0)} MB; the free plan accepts under ${MAX_CHAPTER_VIDEO_BYTES / 1e6} MB per upload`);
      setPhase((p) => ({ ...p, [n]: "uploading" }));
      // the real rendered length (pitch shift + tail) drives the YouTube chapter timestamps
      await putFile(`/api/episodes/${id}/chapters/${n}/video`, blob, "video/mp4", (f) => setPct((x) => ({ ...x, [n]: f })), { "x-video-duration": (frames / FPS).toFixed(2) });
      await reload();
      say("ok", `Chapter ${n + 1} rendered (${(blob.size / 1e6).toFixed(1)} MB, ${fmtMin(frames / FPS)}) and uploaded.`);
    } catch (e) { say("err", `Chapter ${n + 1}: ${(e as Error).message}`); } finally { setPhase((p) => ({ ...p, [n]: "" })); }
  }

  async function remake(n: number, how: "regenerate" | "revoice") {
    const what = single ? "this story" : `chapter ${n + 1}`;
    const msg = how === "regenerate"
      ? `Plan and write a NEW ${single ? "story" : "script"} for ${what}, then voice it? The current script, voice and video are deleted now, and it needs approving again.`
      : `Re-voice ${what} with the current voices? The script stays; its audio and video are deleted now and re-made over the next nights.`;
    if (!window.confirm(msg)) return;
    try {
      await api(`/api/episodes/${id}/chapters/${n}/${how}`, { method: "POST" });
      await reload();
      say("ok", `Queued; the nightly cron will ${how === "regenerate" ? "re-plan, re-write and voice" : "re-voice"} ${single ? "the story" : `chapter ${n + 1}`}.`);
    } catch (e) { say("err", e instanceof ApiError ? e.message : String(e)); }
  }

  async function renderThumbnail() {
    if (!detail) return;
    try {
      say("info", "Drawing thumbnail…");
      const list = await api<EpisodeRow[]>("/api/episodes");
      const episodeNo = list.length - list.findIndex((e) => e.id === id);
      const props = { title: detail.title, valueWord: detail.outline.theme.valueWord, episodeNo: Math.max(1, episodeNo) };
      const still = await renderStillOnWeb({
        composition: { id: "banyan-thumb", component: Thumbnail, durationInFrames: 30, fps: FPS, width: 1280, height: 720, defaultProps: props },
        frame: 0, inputProps: props,
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
      await reload(); say("ok", status === "approved" ? "Approved. You can now open the YouTube step." : status === "archived" ? "Archived. The nightly cron will leave it alone." : "Approval withdrawn.");
    } catch (e) { say("err", e instanceof ApiError ? e.message : String(e)); }
  }

  async function ytInfo() {
    try { setYt(await api<UploadSession>(`/api/episodes/${id}/upload-url`, { method: "POST" })); say("", ""); }
    catch (e) { say("err", e instanceof ApiError ? e.message : String(e)); }
  }

  async function publish() {
    if (!yt) return;
    if ((await reload()).status !== "approved") { say("err", "The episode is no longer approved; approve it again before publishing."); return; }
    if (!window.confirm(`${yt.parts.length > 1 ? `Join the ${yt.parts.length} chapters and upload` : "Upload the video"} to YouTube as UNLISTED? Keep this tab in the foreground until it finishes.`)) return;
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
      say("ok", `Uploaded as unlisted (YouTube id ${videoId}). The 10-minute cron marks it posted once YouTube finishes processing; flip it to public in YouTube Studio.`);
    } catch (e) { setPubPhase(""); say("err", `Publish: ${(e as Error).message}`); }
  }

  if (!detail) return <div className="card">Loading… <Note note={note} /></div>;

  return (
    <>
      <button className="btn" onClick={onBack} style={{ marginBottom: 12 }}>← All episodes</button>
      <div className="card">
        <div className="row spread">
          <h2 style={{ margin: 0 }}>{detail.title}</h2>
          <StatusPill status={detail.status} />
        </div>
        <p className="muted" style={{ margin: "4px 0" }}>{detail.outline.kind} · moral: {moral}</p>
        <div className="steps" aria-label="pipeline">
          {STEPS.map((s, i) => <span key={s} className={i < step ? "done" : i === step ? "now" : ""}>{i < step ? "✓ " : ""}{s}</span>)}
        </div>
        <div className="stats">
          {single ? <>
            <div className="stat"><b>{plan ? "✓" : "–"}</b><span>{plan ? `planned · ${plan.scenes.length} scenes, ${plan.cast.length} characters` : "not planned yet"}</span></div>
            <div className="stat"><b>{totals.voicedLines}/{totals.lines || "–"}</b><span>lines voiced</span></div>
            <div className="stat"><b>{totals.seconds ? fmtMin(totals.seconds) : "–"}</b><span>length · target {fmtMin(TARGET_EPISODE_SECONDS)}</span></div>
            <div className="stat"><b>{totals.renderedChapters ? "✓" : "–"}</b><span>video rendered</span></div>
          </> : <>
            <div className="stat"><b>{totals.voicedChapters}/{rows.length}</b><span>chapters voiced</span></div>
            <div className="stat"><b>{totals.renderedChapters}/{rows.length}</b><span>chapters rendered</span></div>
            <div className="stat"><b>{fmtMin(totals.seconds)}</b><span>scripted so far ({totals.scripted} ch)</span></div>
            <div className="stat"><b>{totals.projected ? fmtMin(totals.projected) : "–"}</b><span>projected episode</span></div>
          </>}
        </div>
        {detail.yt_upload && (
          <p className="small">YouTube: <span className={`pill ${detail.yt_upload.status === "failed" ? "bad" : "ok"}`}>{detail.yt_upload.status}</span>
            {detail.yt_upload.yt_video_id && <> · <a href={`https://studio.youtube.com/video/${detail.yt_upload.yt_video_id}/edit`} target="_blank" rel="noreferrer">open in YouTube Studio</a></>}
            {detail.yt_upload.error && <> — {detail.yt_upload.error}</>}</p>
        )}
      </div>
      <Note note={note} />

      {preview && (
        <div className="card">
          <div className="row spread">
            <h3 style={{ margin: 0 }}>Preview{single ? "" : `: chapter ${preview.n + 1}`}</h3>
            <button className="btn" onClick={() => setPreview(null)}>Close preview</button>
          </div>
          <p className="small muted">Exactly what Render produces: voices at your pitch, sound effects and animation. Scrub freely; nothing is uploaded.</p>
          <Player component={BanyanVideo} inputProps={preview.props} durationInFrames={preview.frames} fps={FPS}
            compositionWidth={1280} compositionHeight={720} controls style={{ width: "100%", borderRadius: 10 }} acknowledgeRemotionLicense />
        </div>
      )}

      {rows.map((r) => (
        <ChapterCard key={r.idx} row={r} voices={voices} locked={locked} phase={phase[r.idx]} pct={pct[r.idx]}
          plan={detail.outline.format === "story" ? plan : undefined} last={r.idx === rows.length - 1}
          onPreview={() => void previewChapter(r.idx)}
          onRender={() => void renderChapter(r.idx)} onRegenerate={() => void remake(r.idx, "regenerate")} onRevoice={() => void remake(r.idx, "revoice")} />
      ))}

      <div className="card">
        <h3>Publish</h3>
        <p className="small muted" style={{ marginTop: 0 }}>Thumbnail → approve (needs the rendered video) → upload unlisted. Nothing reaches YouTube without your approval.</p>
        <div className="row">
          <button className="btn" onClick={() => void renderThumbnail()} disabled={locked}>{detail.thumbnail_key ? "Redraw thumbnail" : "Render + upload thumbnail"}</button>
          {detail.status === "approved"
            ? <button className="btn" onClick={() => void setStatus("pending")}>Withdraw approval</button>
            : <button className="btn primary" onClick={() => void setStatus("approved")} disabled={locked || totals.renderedChapters < rows.length}>Approve</button>}
          <button className="btn" onClick={() => void ytInfo()} disabled={detail.status !== "approved"}>Prepare YouTube upload</button>
          {!locked && <button className="btn danger" onClick={() => { if (window.confirm("Archive this episode? The nightly cron stops working on it and it can't be published. This can't be undone from the Studio.")) void setStatus("archived"); }}>Archive</button>}
        </div>
        {(thumbUrl || detail.thumbnail_key) && <img src={thumbUrl ?? `/assets/${detail.thumbnail_key}`} alt="Episode thumbnail" style={{ width: "100%", maxWidth: 480, borderRadius: 10, marginTop: 12 }} />}
        {yt && (
          <div style={{ marginTop: 12, background: "var(--bg)", padding: 12, borderRadius: 10 }}>
            <p style={{ margin: 0 }}><b>{yt.title}</b></p>
            <pre className="small" style={{ whiteSpace: "pre-wrap" }}>{yt.description}</pre>
            <p className="small">{yt.parts.length > 1 ? `${yt.parts.length} chapters ready` : "video ready"} · thumbnail {yt.thumbnailUrl ? "ready" : "missing; render it above first"}</p>
            <button className="btn primary" onClick={() => void publish()} disabled={!!pubPhase || detail.status !== "approved"}>
              {pubPhase ? `${pubPhase} ${Math.round(pubPct * 100)}%` : "Upload to YouTube (unlisted)"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
