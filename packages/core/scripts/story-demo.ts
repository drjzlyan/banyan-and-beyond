import { analyzeChapter, buildOutline, cfRestRunner, premiseById, selectPremise, themeById } from "../src/index.ts";

// Usage: pnpm --filter @banyan/core story-demo [theme-id] [premise-id]
// Live taste-test of the story planner + scene writer on real Workers AI (costs neurons).
const theme = themeById(process.argv[2] ?? "kindness") ?? themeById("kindness")!;
const premise = (process.argv[3] && premiseById(process.argv[3])) || selectPremise(theme.id, []);
const model = process.env.MODEL || undefined; // e.g. MODEL=@cf/meta/llama-3.3-70b-instruct-fp8-fast
const ai = cfRestRunner(process.env.CLOUDFLARE_ACCOUNT_ID ?? "", process.env.CLOUDFLARE_API_TOKEN ?? "");
const outline = buildOutline(theme, "folk-tale", premise);

console.log(`\n${premise.title} (${premise.source}) — ${theme.valueWord}\n`);
const t0 = Date.now();
try {
  const { generateStory } = await import("../src/generate.ts");
  const out = await generateStory(ai, outline, { ...(model ? { model } : {}), log: (m) => console.log(`  · ${m}\n`) });
  console.log(`PLAN ${JSON.stringify(out.plan, null, 2)}\n`);
  console.log(`(${out.words} words, ${out.attempts} model call(s), ${Math.round((Date.now() - t0) / 1000)} s, model ${model ?? "default"})`);
  if (out.droppedCues.length) console.log(`dropped cues: ${out.droppedCues.join(" | ")}`);
  const a = analyzeChapter(out.spoken, { finalChapter: true, speakers: out.plan.cast.map((c) => c.id), chorus: out.plan.chorus });
  console.log(`~${(a.pitchedSeconds / 60).toFixed(1)} min · ${a.ttsChars} TTS chars · ${a.sfx} cues · craft: ${a.craft.map((c) => `${c.ok ? "✓" : "✗"} ${c.label}`).join(", ")}`);
  if (a.warnings.length) console.log(`warnings:\n- ${a.warnings.join("\n- ")}`);
  console.log(`\n${out.spoken}\n`);
} catch (e) {
  console.log(`FAILED: ${(e as Error).message}\n`);
  process.exitCode = 1;
}
