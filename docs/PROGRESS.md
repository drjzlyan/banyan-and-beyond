# Banyan and Beyond — progress, decisions and plan

_Last updated: 2026-10-10 (P0 scaffold). Keep current at the end of every session._

## 1. Goal

YouTube channel **Banyan and Beyond**: Ajja tells 1-hr episodes (8 × ~7.5-min chapters) for kids 6–12. Social psychology, morality, good behaviour — right-rooted, open-minded. Storybook SVG scenes, two voices (Ajja + Kid), API-assisted YouTube upload.

## 2. Hard constraints (never violate)

- Cloudflare free tier only; Workers AI models only; no paid services in the product.
- Deploy only via GitHub Actions (`drjzlyan/banyan-and-beyond`). Never `wrangler deploy` locally (`--dry-run` fine).
- Studio behind admin token (404 without it). Nothing publishes without human approval.
- Kids safety: validator rejects horror/violence/digits/markup; intro/outro fixed by code.
- Secrets via `gh secret set` one-liners from `.env`; never print tokens.

## 3. Status snapshot

| Area | State |
|---|---|
| Monorepo scaffold, worker (schema/workflows/API), video shell, CI+deploy | ✅ P0 done, live verified |
| Chapter script generation (Workers AI, two-pass, story-demo) | ✅ P1 done, live verified (613-word ch0) |
| Voice per line (Aura-2, nightly budget engine, voice-demo path live) | ✅ P2 done, ear check deferred |
| Remotion chapter render + Studio per-chapter flow + thumbnail | ✅ P3 done, browser-render test deferred |
| YouTube resumable upload + finalize cron | ✅ P4 done, OAuth/secrets/live test deferred |

Live URLs: Studio `https://banyan-and-beyond.dbldr.app/studio/` · health `https://banyan-and-beyond.dbldr.app/health`.

## 4. Neuron budget (do not re-derive)

1 hr ≈ 45k chars → ~123k TTS neurons vs 10k/day free. Cron voices ~1 chapter/night (`0 22 * * *`); episode ready in ~10–14 nights; cadence 1 episode / 2 weeks, 2 staggered in flight.

## 5. Session log (oldest first)

- **2026-10-10 (P0)** — Scaffolded monorepo from chota.vc pattern. Next: `pnpm install`, typecheck, tests, wrangler dry-run, git init + first push, secrets.
- **2026-10-10 (P0 deploy)** — Repo `drjzlyan/banyan-and-beyond` created, pushed, Deploy green after two fixes: (1) deploy.yml uploads only ADMIN_TOKEN (YT_* join in P4); (2) ADMIN_TOKEN set manually in GitHub (local `gh secret set` runs didn't persist). Verified: typecheck ✓, 9 tests ✓, Studio build ✓, dry-run bindings ✓. **DNS gap:** custom domain attached (API shows enabled) but `banyan-and-beyond.dbldr.app` has no DNS record — API token lacks DNS perms so wrangler couldn't auto-create it.
- **2026-10-10 (P0 live)** — Owner added proxied AAAA `100::` for `banyan-and-beyond`. Verified live: `/health` → `{"ok":true}`, `/api/episodes` without token → 404, `/studio/` → 200. **P0 closed.**
- **2026-10-10 (health re-check)** — Re-verified live on request: `/health` → `{"ok":true}`, `/api/episodes` without token → 404, `/studio/` → 200; latest CI + Deploy runs both success. No changes needed.
- **2026-10-10 (P1 story generation)** — Built `generateChapter` (two ~300-word halves, validator retries, fallback model on last attempt of each half) + `story-demo`. Verified live: kindness ch0 = 613 words in 3 attempts, warm Ajja voice, curious Kid, intro prepended, gentle hook ending. Key finding: gpt-oss-120b is a reasoning model — with max_tokens 4000 it returns content:null (reasoning fills the budget); 8000 works. Single calls plateau ~130-230 words, hence two-pass. 14 tests pass. Next: P2 voice per line (Aura-2 Ajja + Kid).
- **2026-10-10 (P2 voice)** — Aura-2 `@cf/deepgram/aura-2-en` per-line TTS (`clips.ts speakLine` → R2), nightly engine `voiceNext` (outline-if-idle else script+voice oldest pending chapter within 3000-char budget; neuron exhaustion pauses till next night; progress persists in D1/R2), `voice-demo` verified live (4 mp3s, sizes sane). Kid defaults to Luna pitched up — ear check deferred. Next: P3 render.
- **2026-10-10 (P3 render)** — Real `BanyanVideo` Remotion composition (1280×720/24fps, puppets + lip-sync + word captions + moral card + progress), `Thumbnail` still, per-speaker browser pitch-shift + mouth envelope (ported from chota), Studio per-chapter render→upload→approve + thumbnail + script view + regenerate. Next: P4 YouTube.
- **2026-10-10 (P4 YouTube)** — Pure upload builders (`youtube-upload.ts`, 6 tests) + worker token-mint/finalize-cron + Studio assemble (ffmpeg.wasm concat) + resumable upload with progress + thumbnail set + complete. Real chapter timestamps from voiced durations. Deferred: owner OAuth + secrets + live upload test. Next: P5 polish.
- **2026-10-10 (P5 + done)** — Detail endpoint includes yt_upload state; README updated. 23 tests pass. **Build complete; deferred owner items in §6.**
## 6. Deferred owner items (everything else is built)

1. **Ear check** — play `/tmp/banyan-voice-*.mp3` (regenerate with `pnpm --filter @banyan/core voice-demo`); confirm Luna works for Ajja at 0.9x and pick the Kid voice (code default: Luna at 1.3x).
2. **YouTube OAuth** — create a Google Cloud project, enable YouTube Data API v3, OAuth consent (external) + desktop/web client, run the consent flow to get a refresh token with `youtube.upload` scope.
3. **Secrets** — `gh secret set YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN`, then add them to `deploy.yml`'s secrets block (currently ADMIN_TOKEN only so deploys stay green).
4. **First live run** — Studio → Make an episode now → let ~2 weeks of crons voice it (or watch `voiceNext` logs) → render chapters in a foreground Chrome tab → approve → assemble + upload unlisted → flip to public in YouTube Studio.
5. **Render QA** — watch one full chapter render for A/V sync, caption timing, puppet mouth; check the thumbnail on a phone.

