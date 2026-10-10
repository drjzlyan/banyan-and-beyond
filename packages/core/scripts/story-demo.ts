import { buildOutline, cfRestRunner, generateChapter, themeById } from "../src/index.ts";

// Usage: pnpm --filter @banyan/core story-demo [theme-id] [chapter]
// Live taste-test of the chapter generator on real Workers AI (costs neurons).
const theme = themeById(process.argv[2] ?? "kindness") ?? themeById("kindness")!;
const chapter = Number(process.argv[3] ?? 0);
const model = process.env.MODEL || undefined; // e.g. MODEL=@cf/meta/llama-3.3-70b-instruct-fp8-fast
const ai = cfRestRunner(process.env.CLOUDFLARE_ACCOUNT_ID ?? "", process.env.CLOUDFLARE_API_TOKEN ?? "");
const outline = buildOutline(theme, "village-story");

console.log(`\n${outline.title} — chapter ${chapter + 1}: ${outline.chapters[chapter].beat}\n`);
try {
  const out = await generateChapter(ai, outline, chapter, model ? { model } : {});
  console.log(`(${out.words} words, ${out.attempts} attempt(s), model ${model ?? "default"})\n`);
  console.log(out.spoken);
  console.log();
} catch (e) {
  console.log(`FAILED: ${(e as Error).message}\n`);
  process.exitCode = 1;
}
