# Banyan and Beyond — progress, decisions and plan

_Last updated: 2026-10-13 (pre-live-run fixes, branch `fix/first-live-run`). Keep current at the end of every session._

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
| Pre-live-run review: regenerate, approval gate, Range, free-tier limits | ✅ fixed on `fix/first-live-run` (not yet merged/deployed) |
| Studio v2: Voice Lab, chapter analysis, System tab (chotavc-style) | ✅ on `fix/first-live-run`, UI-tested against a mock; not deployed |

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
- **2026-10-13 (pre-live-run review)** — Code review before the first live run; all fixes on branch `fix/first-live-run`, **not merged to `main` (merging deploys)**. Fixed: (1) "New script" was a no-op: it did not clear `spoken`/`clips_json`, so `voiceNext` re-read the old script and finished at once. Now it clears them and deletes the old R2 media first. (2) A half-voiced chapter could be rendered and frozen as `rendered`. Chapter states are now `chapter-pending → voiced → rendered`; the video PUT refuses unvoiced chapters and the Render button is disabled until voiced. Legacy `rendered` rows without video count as voiced. (3) Approval gate enforced server-side: `upload-url` and `complete` require `approved`; `approved` requires all 8 chapter videos; `/status` accepts only approve/un-approve (no more setting `posted` by hand); a re-render or regenerate drops approval; uploading/posted episodes are locked. (4) YouTube timestamps now use the real rendered length (`chapters.video_duration`, sent by the Studio as `x-video-duration`), because pitch shift and the 20-frame tail change it. (5) `/assets` Range requests return 206 + `Content-Range`; before, they sent a 200 whose `content-length` didn't match the partial body. (6) Free tier: chapter MP4s are rendered at 1 Mbps with a 95 MB client and server cap (the free plan limits request bodies to 100 MB); re-renders delete the old object; chapter MP4s are deleted from R2 once the episode is posted (R2 has 10 GB free). (7) Media keys carry a revision or text hash, so `max-age=86400` can't serve stale audio or video. (8) The nightly cron now keeps **2 episodes in flight** (§4), where before it only started an outline once every episode was posted. (9) `finalizeUploads` checks for pending rows before minting a token. (10) YouTube state mapping (`videoOutcome`): finished videos report `processingStatus: succeeded`, which the old code never matched, so episodes would have stayed `uploading` forever and blocked the 2-in-flight cap. Now succeeded/processed → posted (only then are MP4s freed); failed/terminated/rejected/deleted → failed; uploaded/processing → keep waiting; a non-OK poll is retried, not marked failed. Enums from API knowledge; docs host unreachable from the session sandbox, so confirm on the first live upload. (11) The Studio clears the YouTube session and disables publish unless the episode is still approved, and re-checks right before uploading. New pure module `core/lifecycle.ts`; 36 tests pass; typecheck, Studio build and wrangler dry-run all OK. **Correction (same day):** this entry first said the in-Worker `voiceNext` path had never run live. That was wrong. D1 shows the cron has run nightly since 10 Oct and voiced chapter 1 within free-plan limits (see the next entry). The `video_duration` ALTER runs lazily on the live D1 at first request after deploy.
- **2026-10-13 (Voice Lab + chapter analysis)** — The live pipeline **is running**: episode `emv2xuaas0112` "The Banyan Tale of Honesty" was outlined 10 Oct, and chapter 1 was scripted and voiced over the nights of 11–12 Oct (39 clips). D1 shows chapter 2 still pending. Analysis of chapter 1 (read from D1 via the Cloudflare connector): 606 words, 3,436 TTS chars (2 nights), **233 s ≈ 3:53**, about half the 7.5-min target, so episodes come out about 31 min, not 60. It also had **3 "tomorrow" hooks** (lines 20, 21, 37), because both halves were told to end on a hook, plus a repeated welcome after the fixed intro. **Ajja uses Luna (a feminine voice) at 0.9×.** Built on the branch:
  - **Voice Lab:** all 40 Aura-2 voices, `/api/voice-preview` (≤300 chars, not stored), a live pitch slider, saved in a D1 `settings` table. The nightly voicer reads the setting, and each clip records its voice.
  - **Re-voice** action: keeps the script, re-voices in the current voices.
  - **Chapter cards:** `core/analysis.ts` shows length at pitch vs target, balance, nights, hooks and validator warnings, with line-by-line playback.
  - **Episode view:** pipeline stepper and projected runtime.
  - **System tab:** health, token, YouTube config, voices, WebCodecs, build sha, deploy links.
  - Tab and episode live in the URL; light/dark; phone layout.
  - **Prompt fix:** only the second half gets the hook, and chapter 1 doesn't re-greet.

  42 tests pass. Playwright drove every Studio flow against a mock API seeded with the real chapter. A temporary verification page (chapter analysis, pitch listening, voice picker, length options) was published as a private artifact: https://claude.ai/artifact/5FBpyv4M6xhhHdYVR8EtAH. **Open decisions for the owner:** (a) Ajja/Kid voices and pitch, (b) chapter length. Keeping ~4 min chapters gives 31-min episodes; 7.5 min means about 53k chars and ~24 nights per episode. (c) Optionally, have `voiceNext` spend leftover nightly budget on the next chapter; today it stops after finishing a chapter, so 3.4k chars uses 2 full nights. **Push blocked:** the Claude GitHub App isn't installed for `drjzlyan`, so this session couldn't push. The branch exists only in the session container until the owner pushes it or installs the app.
## 6. Deferred owner items (everything else is built)

0. **Review + merge `fix/first-live-run`** — merging to `main` deploys. Re-render any chapter rendered before this change, so its `video_duration` gets recorded.
1. **Ear check** — after deploying the branch: Studio → Voice Lab, pick Ajja and Kid voices and pitch, save, then use Re-voice on chapter 1. Until then use the verification artifact above.
2. **YouTube OAuth** — create a Google Cloud project, enable YouTube Data API v3, OAuth consent (external) + desktop/web client, run the consent flow to get a refresh token with `youtube.upload` scope.
3. **Secrets** — `gh secret set YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN`, then add them to `deploy.yml`'s secrets block (currently ADMIN_TOKEN only so deploys stay green).
4. **First live run** — Studio → Make an episode now → let ~2 weeks of crons voice it (or watch `voiceNext` logs) → render chapters in a foreground Chrome tab → approve → assemble + upload unlisted → flip to public in YouTube Studio.
5. **Render QA** — watch one full chapter render for A/V sync, caption timing, puppet mouth; check the thumbnail on a phone.

