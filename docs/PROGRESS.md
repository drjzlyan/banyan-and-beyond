# Banyan and Beyond — progress, decisions and plan

_Last updated: 2026-10-22 (standalone stories deployed; Phase 1 puppet pilot and sound round 2 on `story-world`). Keep current at the end of every session._

## 1. Goal

YouTube channel **Banyan and Beyond**: standalone **~7-min story videos** for kids 6–12 (owner's choice 2026-10-22; before that 8 × 6-min chapters joined into ~48 min). Ajja narrates under the banyan, the Kid listens and reacts, and the story's characters speak in their own voices. Real CC0 sound effects, an animated scene and, next, an acted-out story world. The owner's goal: videos kids can't stop watching. Social psychology, morality, good behaviour — right-rooted, open-minded. Storybook SVG scenes, two voices (Ajja + Kid), API-assisted YouTube upload.

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
| Simple kid-friendly scripts, SFX cues, browser-synthesized sound, animated scene, Preview | ✅ merged to `main` |
| Standalone stories, plan-first engine, character voices, 41 sounds (25 recorded), favicon | ✅ on `story-world`; live story generated, headless render verified; **not merged** |
| Acted-out story world (cast rigs, locations, scene director) | ⏳ Phase 1 rig pilot needs owner go-ahead + Inspyry credits |

Live URLs: Studio `https://banyan-and-beyond.dbldr.app/studio/` · health `https://banyan-and-beyond.dbldr.app/health`.

## 4. Neuron budget (do not re-derive)

A ~7-min story ≈ 850–950 words ≈ 4,500–5,200 TTS chars → 2 nights of voicing at the 3,000-char nightly budget (Aura-2 ≈ 2,727 neurons/1k chars vs 10k/day free). Scripting is the plan plus one gpt-oss call per scene, with retries. **Measured** in Workers AI analytics (GraphQL `aiInferenceAdaptiveGroups`), 2026-10-22: 20 gpt-oss calls = 3,707 neurons (≈185 per call), and 4 Llama fallback calls = 530. So a 12-call story costs ≈2,200 neurons to script, and the same night still voices nearly the full 3,000 chars. A story is ready in **about 2 nights, ≈ 3 videos a week**. Extra character voices cost nothing extra (same chars). 2 stories in flight. Re-measure with the same query if the model or the prompts change.

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
- **2026-10-13 (owner picks + simpler, livelier stories)** — The owner chose, in the voice-check page: **Ajja = pluto @ 0.80×, Kid = iris @ 1.25×** (now the code defaults; the Voice Lab overrides), and **~6-min chapters** (owner's middle option; episodes ≈ 48 min). Note: the page only had Luna recordings, so Pluto and Iris themselves still need an ear check in the Voice Lab after deploy (or with `VOICES=pluto,iris voice-demo`). The owner also asked for stories that are **simpler for kids, with more sound effects and more engaging sound and animation**. Built:
  - **Generator:** 3 parts × ~280 words (`CHAPTER_PARTS`), chapter 720–1050 words, only the last part ends on the hook. The prompt now asks for everyday words, no abstract metaphors, sound words, named characters, a playful Kid, Ajja asking the viewer questions, and a small repeated chorus. Lines are 6–14 words (validator hard cap 20, up to 94 lines).
  - **Sound cues:** the script carries `SFX: <id>` lines from a whitelist of 12 (birds, wind, rain, river, bell, crickets, footsteps, drum, flute, chime, splash, knock): 3–5 per part, at most 24 per chapter, never two in a row. TTS skips them; `sfxCues()` maps each to the line it precedes.
  - **Validator fix:** banned words now match whole words with endings, so "hello", "skill", "switch" and "studied" no longer fail the old substring check.
  - **Browser SFX (`apps/video/src/sfx.ts`):** every effect plus a 16 s looping evening ambience is synthesized with seeded Web Audio. No samples, no neurons; each takes milliseconds. `pitchClips` gives each cue 1.2 s of room (`SFX_GAP_SECONDS`).
  - **New `BanyanVideo`:** dusk→night sky with stars and a rising moon; a swaying banyan with aerial roots; fireflies; grass; a temple whose bell swings. Ajja has glasses, beard, shawl, stick and a gesturing arm; the Kid bounces and waves on "?"/"!". Both blink and nod. Each effect has a visual (birds, rain, river, bell rings, footprints, dholak, music notes, sparkles, blowing leaves, a knocking door) and a comic sound-word bubble ("Ding dong!"). Also a title card, a big caption bubble with the spoken word lit, a pop-in "Today's lesson" card and a progress vine.
  - **Studio:** a **Preview video** player (`@remotion/player`) per chapter, built by the same `prepareChapter` as Render; chapter stats show SFX count and words per line.
  - **Real bug found:** `<Audio>` from `remotion` (Html5Audio) is rejected by `@remotion/web-renderer`, so every browser render would have failed. The composition now uses `@remotion/media`'s Audio.
  - **Render verified headlessly:** an 8 s WebM (VP9 + Opus) rendered with voices, SFX and ambience, and the audio decodes back (5.7 MB/min at 1 Mbps → ~35 MB per 6-min chapter). H.264 can't be tested here because open-source Chromium has no H.264 encoder, so the System tab now checks `VideoEncoder.isConfigSupported` for the exact H.264 config.
  - 48 tests pass; typecheck, build and dry-run are OK; Studio driven with Playwright, including Preview.
  - A 43 s demo (`banyan-demo-scene.mp4`, silent voices) was sent to the owner.

  **Follow-up fixes (same session):** (1) Generation now converges with realistic short parts. 18–26 lines of 6–14 words comes to about 220 words a part, so a joined 720-word floor would have thrown away valid chapters and stalled the queue every night on the same one. Now a 4th part is added when three won't reach `TARGET_CHAPTER_WORDS` (720), the hard floor is 3 × `PART_MIN_WORDS` (540), and a cue ending one part plus a cue starting the next are merged into one. Tests use realistic 22 × 10-word parts. (2) `voiceNext` discarded nothing when it re-scripted a chapter, so stored clips from the old script were kept under the new text. It now starts with no clips and deletes the old `ch-N-line-*` mp3s. Because of this, chapters scripted before the merge with long lines will fail the new 20-word cap and get re-scripted: on those, **Re-voice acts like New script**, so use New script directly.
  **Every chapter scripted before this merges needs New script** (old prompt, long lines, no SFX, Luna). Remotion licensing: the free license covers individuals and companies of up to 3 people; the Player is passed `acknowledgeRemotionLicense`.
- **2026-10-13 (Inspyry storybook art)** — The owner found the code-drawn video unattractive and asked for vectors from **Inspyry** (their own flat-vector generator, `drjzlyan/inspyry-vector-generator-skill`) as the base. Built:
  - `apps/video/art/manifest.json`: 28 single-subject assets on one shared style and palette (cartoon, playful, bold lines, cel shading, 8 warm Indian colours). Ajja (+ talking pose), the Kid as a girl in a yellow frock to match the Iris voice (+ talking and cheering poses), banyan, temple, hut, mango tree, marigolds, diya, cloud, sun, moon, star, peacock, cow, parrot, puppy, butterfly, sparrow, rain cloud, dholak, bansuri, temple bell, splash, kite, logo.
  - `pnpm --filter @banyan/video art`: needs `INSPYRY_API_KEY`; writes `src/art/*.svg`, skips existing files, `--variants N` for picks, `--balance`. Tested against a stand-in API.
  - `ArtScene.tsx`: code-drawn gradient sky and hills; art objects with sway, parallax clouds, a sun that sets and a moon that rises, twinkling stars, scenery dimming at night, a diya glow around the storytellers, a peacock that strolls past, butterflies, the puppy wagging, a talking-pose swap driven by the mouth envelope, a cheer pose on excited Kid lines, and art-based SFX visuals.
  - `BanyanVideo` uses `ArtScene` automatically once `ajja`, `kid` and `banyan` exist, and the old drawn scene until then. Remotion `<Img>` with SVG renders in `@remotion/web-renderer` (verified). Layout was checked with placeholder boxes; final tuning needs the real art.

  **Policy:** Inspyry is a one-time, owner-paid build step. The SVGs get committed and rendering never calls it, so the running product stays free-tier. Use a key: it carries the commercial licence, while the free allowance is personal-use only, which doesn't cover a YouTube channel.
- **2026-10-13 (art generated + scene tuned)** — The owner added the Inspyry connector, so the art was generated through it (all `commercial` licence; ids and sizes in `apps/video/art/generated.json`; 44 credits left). 19 SVGs committed in `apps/video/src/art/`, rejected picks in `art/candidates/`.
  - Characters: the "talking" generations became the only `ajja`/`kid` art, because Inspyry's separate poses didn't match each other (different clothes and colours). Pose swapping is gone; speakers bounce and lean in, the listener nods, the Kid jumps on excited lines. (A soft CSS spotlight was tried here, but CSS radial gradients don't render in the web renderer, see below, and it was removed.)
  - Drawn in code instead of generated, so faces stay consistent: kawaii sun, sleepy crescent moon (with drifting z's), smiling stars, clouds, diyas, temple bell. Also new: a kite that rides the wind, grass flowers, fireflies on crickets, footprints, music notes on flute, wind swirls.
  - `banyan.svg` came with a cut-off top-right canopy; a scalloped clipPath (ellipse + circles) was added by hand to round it. Re-add it if you regenerate.
  - Manifest now lists exactly the 19 generated assets. Verified with stills of every SFX and a 43 s demo render (WebM → MP4); typecheck, 51 tests, build all pass.
- **2026-10-13 (professional-grade animation)** — The owner asked for more professional animation. Built, in order of impact:
  - **Shot planner** (`packages/core/src/shots.ts`, `planShots`, 8 tests): a deterministic "director" turning lines + SFX cues into shots. It opens on an establishing shot; lines get a close-up on the speaker (Ajja ≥ 2.5 s, the Kid ≥ 1.6 s, because her questions are short and sped up), quick exchanges stay on a two-shot, sound cues go wide (deferred until the 2 s minimum if a cut just happened), and the lesson card is wide. Holds are ≥ 3.5 s (2 s to leave the listener's close-up or catch a cue), long monologues get varied after 12 s, and close-up to close-up is a hard cut (shot/reverse-shot).
    Simulated on generator-shaped chapters (3 parts × 18–26 lines of 6–14 words, 3–5 cues a part, pitch applied): Ajja ≈ 50 %, Kid ≈ 16–21 %, wide ≈ 22 %, two-shot ≈ 5–7 % of screen time, ≈ 9 shot changes a minute. With a single 2.5 s bar the Kid got only 3–5 %.
  - **Virtual camera** (`apps/video/src/camera.ts`): framings per shot kind with faces in the upper third, clear of the caption bubble. Moves ease in and out over 1.3 s, with a slow push-in while a shot holds (the establishing shot pulls back). The frame is clamped so world edges never show.
  - **Parallax**: sky 0.06, clouds + kite 0.15, far hills 0.3, near hills + village 0.5, storytellers' plane 1, foreground marigolds + overhanging banyan leaves 1.3.
  - **Cut-out rig** (`art/rig.json`, `pnpm --filter @banyan/video rig` → `ajja|kid.head.svg` / `.body.svg`): heads turn about a neck pivot. Speakers lean in on a spring at line start (anticipation, overshoot, settle) and tilt with the voice. Listeners give two little nods when the other finishes. The Kid hops on excited lines with a decaying bounce, and eyelids blink every 2.5–5.5 s (sometimes a double blink). Measured on a grid render; re-measure if the art is regenerated (the script checks the viewBox).
  - **Light**: god rays at golden hour, a warm/cool grade, an SVG vignette, soft contact shadows, a diya rim light on the characters at night, and an iris-in at the start and iris-out at the end. Effects (birds, rain, flute, chime, fireflies, wind, dholak, splash) are drawn in screen space so they read in any shot; the bell, door and footprints stay in the world.
  - **Calmer motion**: one butterfly, the parrot glances every few seconds, the puppy perks up only on cues and excited lines, gentler tree sway. The eye goes to the speaker.
  - **Renderer findings** (`@remotion/web-renderer`): SVG `<Img>` stays sharp at any zoom. `blur`, `drop-shadow`, `mask-image` and `clip-path` work. CSS radial gradients, `mix-blend-mode` and box-shadow spread do **not**, so glows and the vignette are SVG gradients. Each inline `<svg>` is rasterised on its own, so gradient `<defs>` must live in the same `<svg>` that uses them.
  - **Cost**: depth-of-field blur was tried and dropped (≈90 ms/frame, a third of render time). Rendering is now ≈5× real time (it was 4×), so a 6-minute chapter takes ≈30 min in the Studio tab. Checked at the production 1 Mbps: the eased moves don't smear.
- **2026-10-13 (brand jingle + storytelling)** — The owner asked for catchy brand music that viewers will link to the channel, and for storytelling that keeps kids watching to the end.
  - **Jingle** (`apps/video/src/jingle.ts`): a sonic logo synthesized in the browser (free, no samples, deterministic, so every video carries the identical tune).
    - The motif follows the rhythm of the name, "BAN-yan and be-YOND": four quick notes and a leap to a long high note. It is played on a bansuri-style flute (breath, vibrato, meend slides) over tabla (keherwa groove) and a tanpura drone, in Bhoopali pentatonic. An answer phrase comes back down, then a tabla tihai lands on high Sa with a temple bell.
    - One score in three cuts: **intro** (≈6.6 s, chapter 1), **sting** (3 s, first phrase only, chapters 2–8) and **outro** (9 s, slower reprise under the lesson card).
    - The opening card animates on the notes (`jingleHits`): a bump per name-note, a star burst on the landing.
    - Loudness is ≈ −16 LUFS per cut, peaks ≤ −0.8 dBFS, played at 0.65 in the mix (measured ≈ −14.5 LUFS in a render at 0.8, so lowered to sit near speech; re-check by ear against real voices). The spectrogram matches the score.
    - Variants `classic` (default), `bouncy` and `gentle`: the pick is `JINGLE_VARIANT`, the owner's call.
  - **Chapter bookends** (`core/timeline.ts`, tested): the eight chapter videos are joined into one ~48-min upload, so:
    - chapter 1 opens with the full jingle; chapters 2–8 open with the sting
    - every chapter keeps 2 s after its last line so the cliffhanger is heard before the iris closes (the iris used to cover the last line)
    - **only the final chapter** gets the lesson card, the outro reprise and "See you next time under the banyan tree!" (the lesson card used to appear at the end of all eight chapters)
    - the evening ambience starts after the jingle
    - the sky now runs afternoon → night across the whole episode, not within each chapter, so joined chapters flow on
    - the planner takes the chapter's real intro/outro, so middle chapters keep the close-up on their cliffhanger
    - `frames`, `x-video-duration` and so the YouTube chapter stamps include the bookends
  - **Storyteller pacing** (`pauseAfter`, tested): 1.4 s after Ajja's question to the children ("What would YOU do? Hmm?"), 0.9 s held breath after "And then...", 0.6 s after Ajja's other questions, 0.22 s for quick short back-and-forth, 0.35 s otherwise. It is used by `pitchClips` and the length estimate. (Aura-2 takes no SSML, so pauses are the lever under our control.)
  - **Story craft in the prompt**:
    - start with a surprise in the first two lines
    - plant a small mystery and pay it off near the end
    - things go wrong twice and work the third time
    - say how characters feel
    - "And then..." before a surprise
    - the Kid guesses what happens next
    - a capital-YOU question to the viewers with "Hmm?"
    - a repeated chorus
    - worries stay small and gentle
  - **Chapter endings and continuity:**
    - Non-final chapters now end on an in-the-moment cliffhanger ("And then... guess what happened?") instead of "tomorrow I will tell you…", since the next chapter starts seconds later in the same video. `analyzeChapter` flags "tomorrow" mid-episode.
    - The worker passes chapter 1's opening lines (same characters, same wish) and the previous chapter's last lines (`storySoFar`) into the prompt; the first part of each chapter must answer that cliffhanger.
  - **Episode through-line** (`outlineBeats`): one child's small wish or problem is set up in chapter 1. A mistake in chapter 2, a clue in 3, a tale inside the tale in 4, three tries in 5, the lowest moment in 6, the surprising fix in 7, then celebration and the moral in 8. This applies to **new** episodes; existing outlines in D1 keep their old beats.
  - **Studio checklist**: each chapter card shows the storytelling checks (opening hook, question to viewers, repeated chorus, feelings, Kid guesses, cliffhanger) as ✓/✗ chips, so the owner can see whether the model followed the prompt. **Untested against the live model**: use New script on one chapter and look at the chips.
  - Every chapter needs a re-render for the jingle, stings and bookends; chapters scripted before this need New script for the new storytelling.
- **2026-10-13/14 (art audit + polish, synced to the Mac)** — Every SVG re-checked at full size; the owner picked replacements on the private **Banyan Art Review** page (https://claude.ai/artifact/HPsoAcsDUzrMCSxU5WL6V5; choices in its database collection `verdicts`).
  - **Applied:**
    - parrot: Inspyry `gen_9eFSdAlW_bhpDPtn`, cream background removed
    - peacock: `gen_-BevMIhCaYfLtEcX`, ground shadow removed
    - banyan and mango tree: the originals with their white patches and gaps recoloured
    - kite: `gen_j52FYcuOwijBRU61`, the red diamond
    - logo: book art from `gen_j4UwQVMYaySGh7bg` composed with the correctly spelled lettering of `gen_9MM4AQvVhXuIyr9U`, since Inspyry kept misspelling the name
  - **Dholak:** still awaiting a pick. Candidates are in `art/candidates/`: hand-drawn `dholak.drawn.svg` (recommended) plus Inspyry v7, v9 and v10, with shadows removed. Every pick is recorded in `art/generated.json`. Inspyry serves any past generation at `https://inspyry.com/v1/vectors/<id>/svg`.
  - **Kid rig:** the neck cut in `rig.json` is narrowed (a stray shoulder fragment was showing).
  - **Polish:**
    - caption bubbles pop up per line, with a tail toward the speaker and the spoken word bouncing
    - comic bursts behind sound words
    - pollen by day and fireflies by night
    - falling banyan leaves, diya smoke, and a hop-aware contact shadow
    - the opening card sizes the logo by height
  - **Sound:**
    - a quiet looping music bed in the jingle's key, ducked under speech
    - pop, sparkle and whoosh interface sounds
    - ambience lowered to 0.18
  - **Renderer finding:** content placed outside a transformed element's box is not drawn, so keep such parts in the layout.
  - **History:** this round was first built in a cloud session whose commits could not be pushed. It was replayed on the Mac from the session transcript, with the art re-fetched from Inspyry by id, and the files match the cloud versions.

- **2026-10-22 (make it addictive: standalone stories, plan-first engine, real sounds)** — The owner found the videos boring to watch and to hear and asked for a favicon, better storytelling, complete animation and well-chosen sounds. Diagnosis from the live D1 script (episode 1, chapter 4): the same "secret box" was found and solved **four times** in one chapter, the kite fell and was rescued twice, Gopal was both the cow and Meena's brother, the Kid narrated events ("I tried to catch it"), there were four "What would YOU do? Hmm?", banned metaphors got through, and cues were filler (`splash` before a moo, `drum` before Meena spoke). Cause: each part was written blind from the last six lines and replayed the whole prompt checklist. **Owner decisions** (grilled via questions): act the story out in a story world; Ajja and the Kid as bookends and cutaways; **standalone 6–8 min stories** instead of 48-min episodes; real CC0 samples (the repo may go private, which would also allow royalty-free packs); cast art from Inspyry split into cut-out rigs after a pilot (owner tops up credits); 3–4 extra Aura-2 voices for characters; discard the in-flight 48-min episode. Plan file: `~/.claude/plans/add-favicon-fix-the-calm-quiche.md`. Built on branch `story-world` (Phase 0):
  - **Favicon:** a simple banyan badge (`apps/video/public/favicon.svg` + apple-touch PNG); the Worker redirects `/favicon.ico`.
  - **One story per video:** a story is an episode with one chapter row, so D1, workflows, approval, upload and the 2-in-flight cap are unchanged. New `"single"` timeline role (full jingle + lesson card + outro in one video). One MP4 uploads without ffmpeg concat; no chapter stamps. New `archived` status (Studio button and filter); the nightly engine archives a legacy 8-chapter episode when it meets one, so the old episode stops holding the queue.
  - **Story engine (`core/generate.ts`):** a bank of ~36 public-domain premises (`core/premises.ts`: Panchatantra, Jataka, Tenali, Birbal, village tales), rotated per theme. `planStory` writes a validated plan: cast with fixed ids and kinds, a chorus, a mystery with set-up and pay-off scenes, and 7–8 scenes with location, beat, funny moment and mood. Code tidies number words and Ajja/Kid listed as cast. Then **one call per scene**: measured live, a three-scene call came back at 153 of ~390 words, the same ~150–250-word plateau as before. Each call sees the whole plan, which scenes are done, and where the mystery, chorus and viewer questions go. Lines are `AJJA:` (narrator), `KID:` (listener only) and character ids (`MEENA:`); `SCENE: n` rows mark scenes.
  - **Code checks (`core/story.ts storyProblems`):** replayed lines (content-word overlap), the Kid narrating, value similes ("kindness pours like rain"), viewer questions (1–3 per story); stage directions (`*whistles*`) are stripped. Studio chips: Characters talk, No replays.
  - **Live result** ("Water for the Thirsty Puppy", kindness, 12 calls, 329 s): 850 words, ~6.4 min, 4,507 TTS chars, every craft check passing; four characters (Gita, Kuku the dog, Anjali, Ravi), two failed tries, then the hand-chain twist, the chorus three times. Remaining weaknesses seen: some similes and stage-direction lines from the model, Kid lines in the final scene drifting toward narration.
  - **Character voices:** each cast kind has a default Aura-2 voice and pitch (`core/world.ts CAST_KINDS`; none collides with Ajja's pluto or the Kid's iris), overridable per kind in Voice Lab settings (`cast`, no UI yet). Clips store their pitch. **Ear check needed.** Until the story world exists, Ajja performs the characters' lines on screen; captions show each character's name in its own colour.
  - **Sounds (`core/sounds.ts`):** 41 ids (animals, cartoon foley, reactions, world), each with the words that justify it. Model cues survive only if their line or the next names the sound. Strong sound or action words add cues ("splashed", "giggled", "slipped"). An animal's sound plays the first time it is named. The same sound never repeats within 8 lines or more than 3 times (live, the model put `bark` before almost every line the puppy spoke). **Overlay** sounds land on the word that triggers them, under the voice; **beat** sounds keep the 1.2 s gap.
  - **Recorded samples:** 25 CC0 / public-domain files (Wikimedia Commons, licence checked through its API, and Kenney packs), cut and normalised to −16 LUFS, mono Opus, 440 KB total. Sources, licences and cuts are in `apps/video/sounds.json`; `pnpm --filter @banyan/video sounds` rebuilds them. Wind, music and cartoon foley (boing, slide-whistle slip, zip, swish, squeak, munch, cart, market, crow) are synthesized. The owner signs off on the private **Banyan Sound Check** page (https://claude.ai/artifact/MwtYa7YWxjKbkDbYd4vrRf; verdicts in its db collection `verdicts`).
  - **Studio:** the card shows the story plan (want, chorus, cast with voices, mystery), scene headers and character names.
  - **Cleanup:** the code-drawn fallback scene is removed from `BanyanVideo` (~300 lines).
  - **Verified:** 84 tests, typecheck, build and wrangler dry-run. A headless render of the live story through the real `pitchClips` path (silent voices, 45 s in 62 s) confirmed character captions, sound-word bursts and samples in the mix (the bark at its cue: −19 dB against a −46 dB bed). Dev harnesses `apps/video/dev/story.tsx` and `dev/sounds.tsx` are gitignored.
  - **After an advisor review, same session:**
    - **Story limits derived from scene limits.** The story window now follows from the scene window (floor 6 × 65 words; caps 8 × 17 lines and 8 × 170 words + bookends). Before, valid scenes could fail at the join and stall the queue, as on 10-13. Tested at both extremes.
    - **Writing resumes across nights.** Each accepted scene is saved as `outline.draft`, so a neuron pause or a failing scene resumes the next night. After 3 failed nights (not neuron pauses) the story is re-planned.
    - **Legacy episodes archived on sight.** The nightly engine archives a legacy episode when it meets one, so it can't hold the queue.
    - **`apps/worker/test/voice-next.test.ts`** runs `voiceNext` end to end on node:sqlite with R2 and AI faked. It covers the archive, the plan, six scenes, the cast voice and pitch, finishing voicing, and resuming after a pause.
    - Today's demo runs used ≈4.2k neurons, so the 22 Oct cron voices less.
  - **Not done yet** (Phase 0 items left):
    - ambience by location and music beds by mood: the single evening bed remains
    - character voices in the Voice Lab UI: settings exist, but there is no picker or preview yet
    - expressive acting (mouth shapes, eyebrows, gestures): needs the Phase 1 rig work
    - the dholak pick
  - **On screen it is still Ajja and the Kid under one banyan.** "Same scene forever" and stiff characters remain until **Phase 1 (rig pilot) and Phase 2 (story world)** in the plan file.

- **2026-10-22, later (merged + deployed, dholak review, Phase 1 pilot, sounds round 2)**
  - **Deployed.** `story-world` was fast-forwarded into `main` at `0c3edd8`; CI and Deploy were green. Live checks: `/health` 200, the Studio serves the favicon, `/favicon.ico` redirects.
  - **Sound verdicts.** On the Sound Check page the owner marked 20 keep and 21 replace. The crow is "not a crow sound"; the drum should be "more indian".
  - **Sounds round 2.** BigSoundBank's free files are CC0 1.0, checked per page. It gave real crows, cows, dogs, a rooster, creaking doors, small splashes, apple crunches, child giggles and snores, applause, a market and a cartoon harp "boing". The monkey is a public-domain siamang from Commons.
    - No CC0 dholak or tabla exists, so drum A and B are new synths built from the jingle's tabla strokes, and slip A and B are new slide whistles.
    - The gasp is the Kid's own Aura voice (3 takes; a few characters of TTS).
    - 47 candidates are on **Banyan Sound Check, Round 2**: https://claude.ai/artifact/Srjrbe1cuxrxeVtuHnESLA (db `round2`). The builder and the list are in `apps/video/art/sound-candidates/`. **Next:** apply the picks (see that README).
  - **Dholak pick page:** https://claude.ai/artifact/XEuXNDwGkazhYnzcSuCQX5 (db `pick/dholak`). It shows 5 options large and composited into a real frame. The current art has a handle, so it reads as a hand drum.
  - **Phase 1 pilot (owner approved the phase).** The Inspyry balance was **21 credits, not 44**.
    - Three tries, 3 credits, so 18 are left:
      - v1 had skin the same colour as the blouse, a long skirt hiding the legs, and a ground shadow
      - **v2 (`gen_sGUNfGguRf9FUmDv`) is used:** a T-pose with clean limbs
      - v3 had green skin
      - Inspyry's colour mapping is unreliable between runs.
    - **`scripts/rig-cast.mjs` + `art/cast-rig.json`** cut her into head, torso, upper and lower arms, and legs. Every part keeps the source viewBox.
      - Limbs keep their own shapes over a drawn outline, because the art's shared silhouette path can't move with them.
      - Capsule cuts hide the elbow seam, and a skin fill covers a braid notch in the right arm.
      - Braid segments that crossed the T-posed arms are drawn in code (`plaits`).
    - **`src/Puppet.tsx`:**
      - nested joints
      - 9 poses (idle, walk, run, wave, point, cheer, sad, surprised, laugh), blended over 0.35 s
      - blinks and a talking mouth
      - renders at about 0.2× real time
      - Known rough edge: a thin dark sliver at the left sleeve, visible only up close.
    - Review page: **Puppet Pilot Review**, https://claude.ai/artifact/Fv2FY4oinBMa5GSMLMshzM (db `review/puppet`).
    - **Cost to finish the story world:** about 45–70 more credits (cast, animals with their own small pilot, places, props). The owner needs to top up before Phase 2.
  - Dev harnesses (gitignored): `dev/puppet.tsx`, `dev/variants.tsx`, `dev/story.tsx`, `dev/sounds.tsx`.

- **2026-10-22, evening (owner's picks applied):**
  - **Dholak:** the hand-drawn one.
  - **Sounds:** 18 new recordings — BigSoundBank CC0, with BigSoundBank and TTS source kinds added to `build-sounds.py` and a rebuild verified byte-for-byte on duration.
    - The gasp is the Kid saying "Whoa!".
    - The new synths are the festive dholak chaal (drum) and a straight-down slide whistle (slip).
    - Synths that recordings replaced were removed. All 41 sounds have exactly one source.
  - **Monkey:** still open (the owner rejected the siamang). Three voiced takes in the monkey's own Aura voice are on the Round 2 page.
  - **Puppet look verdict:** not given yet.

- **2026-10-23 (puppet motion with physics):** the owner found the pilot "too puppetty" and asked for smooth movement that respects body physics. The rig was fine; the motion model was the problem (lockstep per-joint sines, no weight, sliding feet, `abs(sin)` "jumps").
  - **`core/motion.ts`** (`simulateMotion`, `legIk`; 9 tests): a fixed-step simulation (1/240 s), sampled per frame, so random-access rendering stays deterministic.
    - Joints are damped springs toward each action's pose, stiff at the body and loose at the hands and head. Moods scale the springs: sad is sluggish, cheer is bouncy.
    - Legs are two-bone IK to planted feet. A foot steps only when it falls behind the hips, with short quick child steps (0.28 s, lift 18 units). The arc has zero vertical speed at both ends.
    - Soft IK and soft knees remove knee pops near full extension.
    - Weight shifts onto the standing foot, the body bobs and leans into acceleration, and the head lags.
    - Jumps: a 0.22 s crouch, a gravity arc, legs tucked by height so neither take-off nor landing snaps, then a squash and settle.
    - Joint speed is capped at 400°/s so nothing strobes at 24 fps. Blinks come at seeded irregular intervals.
    - It is driven by an **action schedule** (`walk` to x, `talk`, `wave`, `jump`, `cheer`, `sad`…), which is the interface the Phase 2 scene director will feed.
  - **The "no pops" test checks joint acceleration**, not speed: a smooth 40° knee flex through a step is right, a sudden change in speed is not.
  - **Re-cut the girl with knees and wrists.** Joints are rounded at the limb's own half-width plus its outline. Hands and feet are boxes, because wide circles had carried chunks of the neighbouring segment as lumps. Clip shapes are separate `<path>`s, because one combined path cancelled the overlap into a hole at the ankles. Arms and head are children of the torso.
  - **`Puppet.tsx`** is now a generic joint tree driven by a `MotionFrame`.
  - The demo is one continuous 23 s performance, rendered at about 0.2× real time. It is republished at the same Puppet Pilot Review link, with round 1 for comparison and a video-scale (300 px) version.
  - **If the owner still finds it stiff,** the next lever is code-drawn bendy (rubber-hose) limbs. That changes the art style, so it is the owner's call.

## 6. Deferred owner items (everything else is built)

0. **Monkey sound:** pick one of the voiced takes on Sound Check Round 2.
   **Puppet look:** give a verdict on Puppet Pilot Review.
0b. **Top up Inspyry credits** (about 45–70 more) before Phase 2. 18 are left.
0c. **Ear-check the character voices** on the first standalone story. The nightly cron archives the old episode and starts one, or press New story.
1. **Ear check** — after deploying the branch: Studio → Voice Lab, pick Ajja and Kid voices and pitch, save, then use Re-voice on chapter 1. Until then use the verification artifact above.
2. **YouTube OAuth** — create a Google Cloud project, enable YouTube Data API v3, OAuth consent (external) + desktop/web client, run the consent flow to get a refresh token with `youtube.upload` scope.
3. **Secrets** — `gh secret set YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN`, then add them to `deploy.yml`'s secrets block (currently ADMIN_TOKEN only so deploys stay green).
4. **First live run** — Studio → Make an episode now → let ~2 weeks of crons voice it (or watch `voiceNext` logs) → render chapters in a foreground Chrome tab → approve → assemble + upload unlisted → flip to public in YouTube Studio.
5. **Render QA** — watch one full chapter render for A/V sync, caption timing, puppet mouth; check the thumbnail on a phone.

