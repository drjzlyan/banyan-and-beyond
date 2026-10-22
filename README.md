# Banyan and Beyond

A faceless YouTube channel: **Ajja** (grandpa) tells standalone ~7-minute stories for kids (6–12) under the old banyan tree, in simple words, with the story's characters speaking in their own voices, real sound effects and a lively animated scene. Folk-tales, village stories and parables about honesty, kindness, duty, courage, respect, sharing, cleanliness and gratitude, retold from public-domain plots. A kid listens, guesses and asks; Ajja answers with warmth. Right-rooted values, open-minded heart.

> **Resuming work? Read [`docs/PROGRESS.md`](docs/PROGRESS.md) first.**

## How it works

```
  nightly cron 22:00 UTC (neuron budget; a story takes ~2-3 nights) or "New story" in Studio
         │
         ▼
  ┌──────────────────  Cloudflare Workflow "banyan-episode"  ──────────────────┐
  │ theme+premise → plan (cast, scenes) → scene by scene → voice per line       │
  │ Workers AI gpt-oss-120b                Aura-2 TTS (Ajja, Kid, cast)  D1+R2 │
  └────────────────────────────────────────────────────────────────────────────┘
         │  episode (8 chapters, pending)
         ▼
  Studio dashboard  https://banyan-and-beyond.dbldr.app/studio/   (admin token)
    preview ─► render MP4 IN YOUR BROWSER (Remotion web renderer) ─► upload to R2 ─► approve
         │
         ▼
  YouTube resumable upload (browser PUTs bytes) ─► Worker sets title/desc/thumbnail
```

One ~7-min story ≈ 900 words ≈ 5,000 TTS chars ≈ 2 nights at the 3,000-char nightly budget (10k neurons/day free), plus the scripting night → **about 2–3 nights per video**. Sound effects are bundled CC0 recordings (`apps/video/sounds.json`) or synthesized in the browser; they cost no neurons.

Everything runs on **Cloudflare's free tier** and is deployed **only by GitHub Actions**.

## Repo layout

| Path | What it is |
|---|---|
| `packages/core` | Pure TypeScript + tests: themes, premises, story world vocabulary, plan-first story generation + story checks, sound choice, voice timeline + nightly budget, shot planner, YouTube helpers + upload builders |
| `apps/worker` | Cloudflare Worker: nightly outline/script/voice engine, admin API, YouTube token mint + finalize cron, public `/assets/*` from R2, serves the Studio |
| `apps/video` | Remotion chapter composition (`BanyanVideo.tsx`), thumbnail (`Thumbnail.tsx`), Studio dashboard (`Studio.tsx`), browser pitch-shift + lip-sync, ffmpeg.wasm concat + resumable YouTube upload |
| `.github/workflows` | `ci.yml` and `deploy.yml` (uploads `ADMIN_TOKEN` only; `YT_*` join when the owner's OAuth is done) |
| `docs/PROGRESS.md` | Status, decisions, runbook, next steps |

## Develop

Requires Node 24+ and pnpm 11.

```bash
pnpm install
cp .env.example .env
pnpm test
pnpm -r typecheck
```

## Deploy

Push to `main`. GitHub Actions tests, builds the dashboard, deploys the Worker (wrangler auto-creates D1 + R2) and uploads secrets.

Required GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `ADMIN_TOKEN`, `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`.

## Safety rails

- The LLM writes `AJJA:`/`KID:`/character lines from a validated plan; banned-word list, no digits, grade 4–6 vocab, code checks for replays and Kid narration; intro/outro fixed by code.
- Nothing is published without a human approving it in Studio.
