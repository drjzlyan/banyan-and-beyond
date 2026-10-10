import { TTS_BIT_RATE, TTS_MODEL, mp3Duration } from "@banyan/core";
import type { Env } from "./env.ts";

export interface StoredLineClip {
  speaker: "AJJA" | "KID";
  text: string;
  duration: number;
  url: string;
}

/** Speak one dialogue line and keep the mp3 in R2. Throws so the cron loop can pause and resume next night. */
export async function speakLine(
  env: Env,
  key: string,
  speaker: "AJJA" | "KID",
  text: string,
): Promise<StoredLineClip> {
  const ttsSpeaker = "luna"; // Kid voice TBD by ear (deferred); Luna pitched up in the browser meanwhile
  const res = (await env.AI.run(TTS_MODEL as never, { text, speaker: ttsSpeaker, encoding: "mp3", bit_rate: TTS_BIT_RATE } as never, { returnRawResponse: true } as never)) as unknown as Response;
  const audio = await res.arrayBuffer();
  if (!res.ok || audio.byteLength < 500) throw new Error(`TTS failed (${res.status}, ${audio.byteLength} bytes)`);
  await env.BUCKET.put(key, audio, { httpMetadata: { contentType: "audio/mpeg" } });
  return { speaker, text, duration: mp3Duration(audio.byteLength), url: `${env.PUBLIC_BASE}/assets/${key}` };
}
