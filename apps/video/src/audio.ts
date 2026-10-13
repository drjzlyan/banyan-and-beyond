import { SFX_GAP_SECONDS, type PreparedClip, type SfxId } from "@banyan/core";

export const FPS = 24;

type Clips = PreparedClip[];

/** Decode each dialogue clip and turn loudness into a per-frame mouth-openness curve (0..1). */
export async function mouthEnvelope(clips: Clips, duration: number): Promise<number[]> {
  const frames = Math.ceil(duration * FPS) + 1;
  const env = new Array<number>(frames).fill(0);
  const ctx = new AudioContext();
  try {
    for (const clip of clips) {
      const buf = await (await fetch(clip.url)).arrayBuffer();
      const audio = await ctx.decodeAudioData(buf);
      const data = audio.getChannelData(0);
      const win = Math.floor(audio.sampleRate / FPS);
      const startFrame = Math.round(clip.start * FPS);
      for (let f = 0; f * win < data.length; f++) {
        let sum = 0;
        const end = Math.min(data.length, (f + 1) * win);
        for (let i = f * win; i < end; i++) sum += data[i] * data[i];
        const idx = startFrame + f;
        if (idx < frames) env[idx] = Math.sqrt(sum / Math.max(1, end - f * win));
      }
    }
  } finally {
    await ctx.close();
  }
  const sorted = env.filter((v) => v > 0.005).sort((a, b) => a - b);
  const ref = sorted[Math.floor(sorted.length * 0.9)] || 1;
  const norm = env.map((v) => Math.min(1, v / ref));
  return norm.map((v, i) => (v * 2 + (norm[i - 1] ?? v) + (norm[i + 1] ?? v)) / 4);
}

const GAP = 0.35;

export function wavBlob(buf: AudioBuffer): Blob {
  const data = buf.getChannelData(0);
  const out = new DataView(new ArrayBuffer(44 + data.length * 2));
  const w = (o: number, str: string) => [...str].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); out.setUint32(4, 36 + data.length * 2, true); w(8, "WAVEfmt ");
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * 2, true);
  out.setUint16(32, 2, true); out.setUint16(34, 16, true); w(36, "data"); out.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 0x7fff, true);
  return new Blob([out], { type: "audio/wav" });
}

const pitchOf = (speaker: string, ajja: number, kid: number) => (speaker === "KID" ? kid : ajja);

export interface TimedCue { id: SfxId; at: number }

/**
 * Resample every clip by its speaker's pitch (Ajja down for warmth, Kid up for youth),
 * then rebuild the timeline so captions, mouth and video length stay in sync. Each sound
 * cue gets SFX_GAP_SECONDS of room before the line it belongs to (the sound tails under it).
 */
export async function pitchClips(
  clips: Clips, ajjaPitch: number, kidPitch: number, cues: { id: SfxId; before: number }[] = [],
): Promise<{ clips: Clips; duration: number; cues: TimedCue[] }> {
  const ctx = new AudioContext();
  const out: Clips = [];
  const timed: TimedCue[] = [];
  let cursor = 0;
  const place = (i: number) => {
    for (const c of cues) if (c.before === i) { timed.push({ id: c.id, at: cursor }); cursor += SFX_GAP_SECONDS; }
  };
  try {
    for (const [i, clip] of clips.entries()) {
      place(i);
      const rate = pitchOf(clip.speaker, ajjaPitch, kidPitch);
      const decoded = await ctx.decodeAudioData(await (await fetch(clip.url)).arrayBuffer());
      const length = Math.ceil(decoded.length / rate);
      const offline = new OfflineAudioContext(1, length, decoded.sampleRate);
      const src = offline.createBufferSource();
      src.buffer = decoded;
      src.playbackRate.value = rate;
      src.connect(offline.destination);
      src.start();
      const rendered = await offline.startRendering();
      const duration = rendered.length / rendered.sampleRate;
      const scale = duration / (clip.end - clip.start);
      out.push({
        ...clip,
        url: URL.createObjectURL(wavBlob(rendered)),
        start: cursor,
        end: cursor + duration,
        words: clip.words.map((wd) => ({ text: wd.text, start: cursor + (wd.start - clip.start) * scale, end: cursor + (wd.end - clip.start) * scale })),
      });
      cursor += duration + GAP;
    }
    place(clips.length);
  } finally {
    await ctx.close();
  }
  const trailing = cues.some((c) => c.before >= clips.length);
  return { clips: out, duration: trailing ? cursor : cursor - GAP, cues: timed };
}
