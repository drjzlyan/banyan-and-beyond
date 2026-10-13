# Banyan and Beyond

A faceless YouTube channel: **Ajja** (grandpa) tells gentle ~48-minute story episodes (8 × ~6-min chapters) for kids (6–12), in simple words with sound effects and a lively animated banyan scene under the old banyan tree — folk-tales, village stories and parables about honesty, kindness, duty, courage, respect, sharing, cleanliness and gratitude. A kid asks questions; Ajja answers with warmth. Right-rooted values, open-minded heart.

> **Resuming work? Read [`docs/PROGRESS.md`](docs/PROGRESS.md) first.**

## How it works

```
  nightly cron 22:00 UTC (~1 chapter/night, neuron budget) or "Make an episode now" in Studio
         │
         ▼
  ┌──────────────────  Cloudflare Workflow "banyan-episode"  ──────────────────┐
  │ pick theme → outline (8 ch) → chapter script → voice per line (Ajja + Kid) │
  │ Workers AI gpt-oss-120b      Workers AI Aura-2 TTS              D1+R2      │
  └────────────────────────────────────────────────────────────────────────────┘
         │  episode (8 chapters, pending)
         ▼
  Studio dashboard  https://banyan-and-beyond.dbldr.app/studio/   (admin token)
    preview ch ─► render ch MP4 IN YOUR BROWSER (Remotion web renderer) ─► upload to R2 ─► approve all
         │
         ▼
  Concat 8 MP4s in browser ─► YouTube resumable upload (browser PUTs bytes) ─► Worker sets title/desc/thumbnail
```

One ~6-min chapter ≈ 840 words ≈ 4,800 TTS chars ≈ 2 nights at the 3,000-char nightly budget (10k neurons/day free) → each episode assembles over **~16 nights**. Sound effects and ambience are synthesized in the browser at render time and cost no neurons.

Everything runs on **Cloudflare's free tier** and is deployed **only by GitHub Actions**.

## Repo layout

| Path | What it is |
|---|---|
| `packages/core` | Pure TypeScript + tests: themes, selection, story validator, two-pass chapter generation, voice timeline + nightly budget, YouTube helpers + upload builders |
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

- The LLM writes `AJJA:`/`KID:` lines only; banned-word list, no digits, grade 4–6 vocab; intro/outro fixed by code.
- Nothing is published without a human approving it in Studio.
