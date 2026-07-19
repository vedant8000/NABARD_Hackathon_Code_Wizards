import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "inline",
      includeAssets: ["favicon.svg", "icons.svg"],
      manifest: {
        name: "MIRA (मीरा) — Mitra for Intelligence, Risk & Analytics",
        short_name: "MIRA",
        description:
          "AI cash-flow prediction & early risk flagging for rural micro enterprises",
        theme_color: "#14532d",
        background_color: "#FAF7F0",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // take over immediately so users never see a stale build after refresh
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,svg,woff2,json}"],
        runtimeCaching: [
          {
            urlPattern: /\/api\/(?!chat|auth).*/,
            handler: "NetworkFirst",
            method: "GET",
            options: {
              cacheName: "mira-api",
              expiration: { maxAgeSeconds: 24 * 60 * 60 },
              networkTimeoutSeconds: 4,
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: { "/api": { target: "http://127.0.0.1:8000", ws: true } },
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
});
