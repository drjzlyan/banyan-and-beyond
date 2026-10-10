import { AJJA_PITCH, AJJA_SPEAKER, KID_PITCH, KID_SPEAKER, cfRestAudioRunner, synthesizeLine } from "../src/index.ts";

// Usage: pnpm --filter @banyan/core voice-demo
// Voices 2 Ajja + 2 Kid lines via live Aura-2 TTS and saves mp3s to /tmp.
// THE OWNER MUST LISTEN: voice quality can never be judged by Claude.
// Costs ~1k neurons.
const tts = cfRestAudioRunner(process.env.CLOUDFLARE_ACCOUNT_ID ?? "", process.env.CLOUDFLARE_API_TOKEN ?? "");
const lines = [
  { speaker: "AJJA" as const, text: "Namaste little friends, come sit with me under the old banyan tree." },
  { speaker: "KID" as const, text: "Ajja, why do we gather under this big tree every evening?" },
  { speaker: "AJJA" as const, text: "Because the banyan listens to our hearts, and it teaches us how a simple kindness can ripple through every home." },
  { speaker: "KID" as const, text: "So when I share my mango, the sharing is the pebble that makes ripples?" },
];

console.log(`Ajja voice: ${AJJA_SPEAKER} (browser pitch ${AJJA_PITCH}x) · Kid voice: ${KID_SPEAKER} (browser pitch ${KID_PITCH}x)\n`);
const { writeFileSync } = await import("node:fs");
for (const [i, l] of lines.entries()) {
  const audio = await synthesizeLine(tts, l.speaker, l.text);
  const path = `/tmp/banyan-voice-${i}-${l.speaker.toLowerCase()}.mp3`;
  writeFileSync(path, Buffer.from(audio));
  console.log(`${l.speaker}: ${(audio.byteLength / 1024).toFixed(1)} KB -> ${path}`);
}
console.log("\nListen and judge: warmth for Ajja, child-like for Kid, and how numbers/small words are read.");
