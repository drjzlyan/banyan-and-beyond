import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { defineConfig } from "vite";

/** Shown in the Studio's System tab so the owner can tell which commit is live. */
const sha = process.env.GITHUB_SHA ?? (() => { try { return execSync("git rev-parse HEAD").toString().trim(); } catch { return "dev"; } })();

const REMOTE = process.env.STUDIO_API ?? "https://banyan-and-beyond.dbldr.app";

export default defineConfig({
  base: "/studio/",
  plugins: [react()],
  define: { __BUILD__: JSON.stringify({ sha, at: new Date().toISOString() }) },
  build: { outDir: "../worker/public/studio", emptyOutDir: true, chunkSizeWarningLimit: 4000 },
  server: { port: 5173, proxy: { "/api": { target: REMOTE, changeOrigin: true }, "/assets": { target: REMOTE, changeOrigin: true }, "/health": { target: REMOTE, changeOrigin: true } } },
});
