import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const REMOTE = process.env.STUDIO_API ?? "https://banyan-and-beyond.dbldr.app";

export default defineConfig({
  base: "/studio/",
  plugins: [react()],
  build: { outDir: "../worker/public/studio", emptyOutDir: true, chunkSizeWarningLimit: 4000 },
  server: { port: 5173, proxy: { "/api": { target: REMOTE, changeOrigin: true }, "/assets": { target: REMOTE, changeOrigin: true } } },
});
