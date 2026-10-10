# Banyan and Beyond

A faceless YouTube channel: **Ajja** (grandpa) tells gentle 1-hour story episodes for kids (6–12) under the old banyan tree — folk-tales, village stories and parables about honesty, kindness, duty, courage, respect, sharing, cleanliness and gratitude. A kid asks questions; Ajja answers with warmth. Right-rooted values, open-minded heart.

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

1 hour ≈ 45k chars ≈ 123k TTS neurons vs 10k/day free → each episode assembles over **~10–14 nights (1 episode / 2 weeks)**. This is physics, not code.

Everything runs on **Cloudflare's free tier** and is deployed **only by GitHub Actions**.

## Repo layout

| Path | What it is |
|---|---|
| `packages/core` | Pure TypeScript + tests: themes, selection, story validator, voice timeline, YouTube helpers |
| `apps/worker` | Cloudflare Worker: Workflows, crons, admin API, public `/assets/*` from R2, serves the Studio |
| `apps/video` | Remotion composition (`BanyanVideo.tsx`), Studio dashboard (`Studio.tsx`) |
| `.github/workflows` | `ci.yml` and `deploy.yml` |
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
