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
| Monorepo scaffold, core (themes/selection/validator/timeline/youtube), worker (schema/workflows/API), video shell, CI+deploy | ✅ P0 done, needs live verify |
| Chapter script generation (Workers AI) | ⬜ P1 next |
| Voice per line (Aura-2 Ajja + Kid) | ⬜ P2 |
| Remotion chapter render + Studio per-chapter flow | ⬜ P3 |
| YouTube resumable upload + finalize | ⬜ P4 |

Live URLs: Studio `https://banyan-and-beyond.dbldr.app/studio/` · health `https://banyan-and-beyond.dbldr.app/health`.

## 4. Neuron budget (do not re-derive)

1 hr ≈ 45k chars → ~123k TTS neurons vs 10k/day free. Cron voices ~1 chapter/night (`0 22 * * *`); episode ready in ~10–14 nights; cadence 1 episode / 2 weeks, 2 staggered in flight.

## 5. Session log

- **2026-10-10 (P0)** — Scaffolded monorepo from chota.vc pattern. Next: `pnpm install`, typecheck, tests, wrangler dry-run, git init + first push, secrets.
- **2026-10-10 (P0 deploy)** — Repo `drjzlyan/banyan-and-beyond` created, pushed, Deploy green after two fixes: (1) deploy.yml uploads only ADMIN_TOKEN (YT_* join in P4); (2) ADMIN_TOKEN set manually in GitHub (local `gh secret set` runs didn't persist). Verified: typecheck ✓, 9 tests ✓, Studio build ✓, dry-run bindings ✓. **DNS gap:** custom domain attached (API shows enabled) but `banyan-and-beyond.dbldr.app` has no DNS record — API token lacks DNS perms so wrangler couldn't auto-create it. - **2026-10-10 (P0 live)** — Owner added proxied AAAA `100::` for `banyan-and-beyond`. Verified live: `/health` → `{"ok":true}`, `/api/episodes` without token → 404, `/studio/` → 200. **P0 closed.**
