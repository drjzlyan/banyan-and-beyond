import { AJJA_PITCH, AJJA_SPEAKER, AURA2_VOICES, KID_PITCH, KID_SPEAKER, TTS_BIT_RATE, TTS_MODEL, cfRestAudioRunner, synthesizeLine } from "../src/index.ts";

// Usage: pnpm --filter @banyan/core voice-demo
//   Voices 2 Ajja + 2 Kid lines via live Aura-2 TTS and saves mp3s to /tmp. Costs ~1k neurons.
// Audition other voices before the Studio Voice Lab is deployed:
//   VOICES=pluto,mars,odysseus,zeus pnpm --filter @banyan/core voice-demo
//   Writes /tmp/banyan-voices/<voice>.mp3 plus index.html (players with pitch sliders). ~300 neurons per voice.
// THE OWNER MUST LISTEN: voice quality can never be judged by Claude.
const tts = cfRestAudioRunner(process.env.CLOUDFLARE_ACCOUNT_ID ?? "", process.env.CLOUDFLARE_API_TOKEN ?? "");
const { mkdirSync, writeFileSync } = await import("node:fs");

const audition = (process.env.VOICES ?? "").split(",").map((v) => v.trim()).filter(Boolean);
if (audition.length) {
  const unknown = audition.filter((v) => !(AURA2_VOICES as readonly string[]).includes(v));
  if (unknown.length) throw new Error(`unknown voices: ${unknown.join(", ")}. Choose from: ${AURA2_VOICES.join(", ")}`);
  const text = process.env.SAMPLE ?? "Come, sit close to me under the old banyan tree, and I will tell you a story about a very honest farmer.";
  const dir = "/tmp/banyan-voices";
  mkdirSync(dir, { recursive: true });
  for (const v of audition) {
    const audio = await tts(TTS_MODEL, { text, speaker: v, encoding: "mp3", bit_rate: TTS_BIT_RATE });
    writeFileSync(`${dir}/${v}.mp3`, Buffer.from(audio));
    console.log(`${v}: ${(audio.byteLength / 1024).toFixed(1)} KB`);
  }
  // a tiny local page: same resample the renderer uses (preservesPitch off + playbackRate)
  const rows = audition.map((v) => `<p><b>${v}</b><br><audio controls src="${v}.mp3"></audio></p>`).join("\n");
  writeFileSync(`${dir}/index.html`, `<!doctype html><meta charset="utf-8"><title>Banyan voice audition</title>
<body style="font:16px system-ui;max-width:640px;margin:24px auto;padding:0 16px">
<h1>Voice audition</h1><p>${text}</p>
<label>Pitch <b id="v">1.00x</b><input id="r" type="range" min="0.7" max="1.5" step="0.05" value="1" style="width:100%"></label>
${rows}
<script>const r=document.getElementById("r"),a=[...document.querySelectorAll("audio")];
const set=()=>{document.getElementById("v").textContent=Number(r.value).toFixed(2)+"x";a.forEach(x=>{x.preservesPitch=false;x.playbackRate=Number(r.value)})};
r.oninput=set;a.forEach(x=>x.onplay=set);set();</script></body>`);
  console.log(`\nOpen ${dir}/index.html in Chrome. Pick Ajja and Kid, then save them in the Studio Voice Lab.`);
  process.exit(0);
}

const lines = [
  { speaker: "AJJA" as const, text: "Namaste little friends, come sit with me under the old banyan tree." },
  { speaker: "KID" as const, text: "Ajja, why do we gather under this big tree every evening?" },
  { speaker: "AJJA" as const, text: "Because the banyan listens to our hearts, and it teaches us how a simple kindness can ripple through every home." },
  { speaker: "KID" as const, text: "So when I share my mango, the sharing is the pebble that makes ripples?" },
];

console.log(`Ajja voice: ${AJJA_SPEAKER} (browser pitch ${AJJA_PITCH}x) · Kid voice: ${KID_SPEAKER} (browser pitch ${KID_PITCH}x)\n`);
for (const [i, l] of lines.entries()) {
  const audio = await synthesizeLine(tts, l.speaker, l.text);
  const path = `/tmp/banyan-voice-${i}-${l.speaker.toLowerCase()}.mp3`;
  writeFileSync(path, Buffer.from(audio));
  console.log(`${l.speaker}: ${(audio.byteLength / 1024).toFixed(1)} KB -> ${path}`);
}
console.log("\nListen and judge: warmth for Ajja, child-like for Kid, and how numbers/small words are read.");
