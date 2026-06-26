import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Served behind Cloudflare Tunnel at worldcup.meowbiter.me as static files,
// so base is root-relative and assets stay same-origin.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    sourcemap: false,
    // The data sync timer writes live JSON into dist/data every 2 min. Vite's
    // default emptyOutDir wipes dist/ on every build, which would 404 the live
    // feed for up to 2 min after a deploy. Keep dist/data intact across builds.
    emptyOutDir: false,
  },
});
