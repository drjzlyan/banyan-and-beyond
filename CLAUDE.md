# banyan-and-beyond — instructions for Claude sessions

**First, read [`docs/PROGRESS.md`](docs/PROGRESS.md)** and [`README.md`](README.md). Update PROGRESS.md at the end of every session.

Non-negotiables (details in PROGRESS.md §2):
- Cloudflare **free tier only**; Cloudflare-hosted Workers AI models only; no paid services in the product.
- Deploy **only via GitHub Actions** (`drjzlyan/banyan-and-beyond`). Never `wrangler deploy` locally (`--dry-run` is fine).
- Secrets via `! … gh secret set …` one-liners reading from `.env`. Never print tokens or keys.
- Kids-safety validator is strict; intro/outro fixed by code; nothing publishes without human approval.
- Commits: `git -c user.name=dhiraj-salian -c user.email=dhirajsalian1996@gmail.com commit …`, ending with the `Co-Authored-By: Claude …` trailer.
