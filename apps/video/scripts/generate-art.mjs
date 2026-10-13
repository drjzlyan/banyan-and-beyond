#!/usr/bin/env node
// Generate the storybook art with Inspyry (https://inspyry.com) from art/manifest.json into src/art/*.svg.
//
//   INSPYRY_API_KEY=ik_… pnpm --filter @banyan/video art              # every missing asset
//   INSPYRY_API_KEY=ik_… pnpm --filter @banyan/video art -- ajja kid   # just these ids (regenerates)
//   … art -- --variants 3 ajja                                          # ajja.v1.svg … v3 to pick from
//   … art -- --balance                                                  # credits left, no generation
//
// One-time build asset: the SVGs are committed, so rendering never calls Inspyry (the product stays
// free-tier). An API key carries the commercial licence a YouTube channel needs; the keyless free
// allowance is personal-use only, so this script requires a key. Never prints the key.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "art/manifest.json"), "utf8"));
const outDir = join(root, "src/art");
const base = process.env.INSPYRY_API_BASE ?? "https://inspyry.com";
const key = (process.env.INSPYRY_API_KEY ?? process.env.INSPYRY_API_TOKEN ?? "").trim();

const args = process.argv.slice(2).filter((a) => a !== "--");
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const variants = Number(flag("--variants") ?? 1);
const balanceOnly = args.includes("--balance");
const only = args.filter((a) => !a.startsWith("--"));

if (!key) {
  console.error("INSPYRY_API_KEY is not set. Create a key at https://inspyry.com/account (keys include the commercial licence).");
  process.exit(3);
}

async function call(method, path, body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(base + path, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json", "User-Agent": "banyan-and-beyond-art/1.0" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data;
    const retry = [429, 500, 502, 503, 504].includes(res.status) && !["quota_exceeded", "attempt_limit"].includes(data.code) && attempt < 3;
    if (!retry) throw new Error(`HTTP ${res.status} ${data.code ?? ""}: ${data.error ?? ""}`.trim());
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
}

if (balanceOnly) {
  const b = await call("GET", "/v1/balance");
  console.log(`credits: ${b.credits} · free left today: ${b.free_left}/${b.free_limit}`);
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });
const assets = manifest.assets.filter((a) => (only.length ? only.includes(a.id) : !existsSync(join(outDir, `${a.id}.svg`))));
if (!assets.length) { console.log("Nothing to generate (all assets exist). Pass ids to regenerate."); process.exit(0); }

const { $comment, ...defaults } = manifest.defaults;
void $comment;
let failures = 0;
for (const a of assets) {
  const { id, layer, prompt, ...overrides } = a;
  void layer;
  const body = { prompt, ...defaults, ...overrides, background: { kind: "transparent" } };
  for (let v = 1; v <= variants; v++) {
    const file = variants > 1 ? `${id}.v${v}.svg` : `${id}.svg`;
    try {
      const r = await call("POST", "/v1/vectors", body);
      if (!/<svg/i.test(r.svg ?? "")) throw new Error("no SVG in the response");
      writeFileSync(join(outDir, file), r.svg);
      console.log(`✓ ${file}  (${r.svg.length} bytes, licence ${r.license}, credits left ${r.credits_left})${r.warnings?.length ? `  warnings: ${r.warnings.join("; ")}` : ""}`);
      if (r.license !== "commercial") console.warn(`  ! ${file} is licensed "${r.license}", not commercial`);
    } catch (e) {
      failures++;
      console.error(`✗ ${file}: ${e.message}`);
      if (/402|payment_required/.test(e.message)) { console.error("Out of credits: https://inspyry.com/pricing"); process.exit(4); }
    }
  }
}
process.exit(failures ? 5 : 0);
