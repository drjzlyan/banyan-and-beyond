import { useCallback, useEffect, useRef, useState } from "react";

export type NoteKind = "ok" | "err" | "info" | "";

export function useNote() {
  const [note, setNote] = useState<{ kind: NoteKind; text: string } | null>(null);
  const say = useCallback((kind: NoteKind, text: string) => setNote(text ? { kind, text } : null), []);
  return { note, say };
}

export function Note({ note }: { note: { kind: NoteKind; text: string } | null }) {
  if (!note?.text) return null;
  return <div className={`note ${note.kind || "info"}`} role={note.kind === "err" ? "alert" : "status"}>{note.text}</div>;
}

const STATUS_TONE: Record<string, string> = {
  "chapter-pending": "sun", outline: "sun", pending: "", voiced: "", rendered: "ok", approved: "ok", uploading: "warn", posted: "ok", failed: "bad", archived: "",
};
const STATUS_LABEL: Record<string, string> = {
  "chapter-pending": "voicing", outline: "outline", pending: "ready to render", voiced: "voiced", rendered: "rendered", approved: "approved", uploading: "uploading", posted: "posted", archived: "archived",
};

export function StatusPill({ status, chapter }: { status: string; chapter?: boolean }) {
  const label = chapter && status === "pending" ? "voiced" : STATUS_LABEL[status] ?? status;
  return <span className={`pill ${STATUS_TONE[status] ?? ""}`}>{label}</span>;
}

/**
 * One shared audio element. preservesPitch=false + playbackRate is exactly the resample the
 * renderer applies (pitchClips), so what you hear here is what the video will sound like.
 */
export function usePlayer() {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  useEffect(() => () => { ref.current?.pause(); }, []);
  const stop = useCallback(() => { ref.current?.pause(); setPlaying(null); }, []);
  const play = useCallback((id: string, src: string, rate: number, onEnd?: () => void) => {
    ref.current?.pause();
    const a = new Audio(src);
    a.preservesPitch = false;
    a.playbackRate = rate;
    a.onended = () => { setPlaying(null); onEnd?.(); };
    a.onerror = () => setPlaying(null);
    ref.current = a;
    setPlaying(id);
    void a.play().catch(() => setPlaying(null));
  }, []);
  const setRate = useCallback((rate: number) => { if (ref.current) ref.current.playbackRate = rate; }, []);
  return { play, stop, playing, setRate };
}

export const fmtMin = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
