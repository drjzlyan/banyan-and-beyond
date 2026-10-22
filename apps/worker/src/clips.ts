import { DEFAULT_VOICE_SETTINGS, TTS_BIT_RATE, TTS_MODEL, mergeVoiceSettings, mp3Duration, type VoiceSettings } from "@banyan/core";
import type { Env } from "./env.ts";

export interface StoredLineClip {
  /** AJJA, KID or a story character's id */
  speaker: string;
  text: string;
  duration: number;
  url: string;
  /** Aura voice that spoke it, so the Studio can flag chapters voiced before a voice change */
  voice?: string;
  /** browser pitch for a story character's line (Ajja's and the Kid's come from the Voice Lab) */
  pitch?: number;
}

/** Speak one dialogue line and keep the mp3 in R2. Throws so the cron loop can pause and resume next night. */
export async function speakLine(
  env: Env,
  key: string,
  speaker: string,
  text: string,
  voice: string,
  pitch?: number,
): Promise<StoredLineClip> {
  const audio = await tts(env, voice, text);
  await env.BUCKET.put(key, audio, { httpMetadata: { contentType: "audio/mpeg" } });
  return { speaker, text, duration: mp3Duration(audio.byteLength), url: `${env.PUBLIC_BASE}/assets/${key}`, voice, ...(pitch ? { pitch } : {}) };
}

/** One Aura-2 call. Throws (with the neuron error text intact) so callers can pause till tomorrow. */
export async function tts(env: Env, voice: string, text: string): Promise<ArrayBuffer> {
  const res = (await env.AI.run(TTS_MODEL as never, { text, speaker: voice, encoding: "mp3", bit_rate: TTS_BIT_RATE } as never, { returnRawResponse: true } as never)) as unknown as Response;
  const audio = await res.arrayBuffer();
  if (!res.ok || audio.byteLength < 500) throw new Error(`TTS failed (${res.status}, ${audio.byteLength} bytes): ${new TextDecoder().decode(audio.slice(0, 200))}`);
  return audio;
}

/** The owner's Voice Lab choices (defaults until first saved). */
export async function getVoiceSettings(env: Env): Promise<VoiceSettings> {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'voices'").first<{ value: string }>();
  if (!row) return DEFAULT_VOICE_SETTINGS;
  try {
    return mergeVoiceSettings(DEFAULT_VOICE_SETTINGS, JSON.parse(row.value)).settings;
  } catch {
    return DEFAULT_VOICE_SETTINGS;
  }
}

export async function saveVoiceSettings(env: Env, s: VoiceSettings): Promise<void> {
  await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('voices', ?, ?)").bind(JSON.stringify(s), new Date().toISOString()).run();
}

/** Delete every R2 object under a prefix (keeps the 10 GB free allowance from filling up). */
export async function deletePrefix(env: Env, prefix: string): Promise<number> {
  let n = 0;
  let cursor: string | undefined;
  do {
    const page = await env.BUCKET.list({ prefix, cursor });
    if (page.objects.length) await env.BUCKET.delete(page.objects.map((o) => o.key));
    n += page.objects.length;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return n;
}
