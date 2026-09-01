/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// Supabase origin is known at build/dev time when configured.
const supabaseUrl = process.env.VITE_SUPABASE_URL ?? "";
let supabaseOrigin: string | null = null;
try {
  supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : null;
} catch {
  supabaseOrigin = null;
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        "name": "MarketLog — Event & Sales Tracker",
        "short_name": "MarketLog",
        "description": "Track craft fair and market events, inventory, sales, expenses and profitability — reliably, even offline.",
        "id": "/",
        "start_url": "/",
        "scope": "/",
        "display": "standalone",
        "orientation": "portrait-primary",
        "background_color": "#faf8f3",
        "theme_color": "#1c6e54",
        "categories": [
          "business",
          "finance",
          "productivity"
        ],
        "icons": [
          {
            "src": "icons/pwa-192.png",
            "sizes": "192x192",
            "type": "image/png",
            "purpose": "any"
          },
          {
            "src": "icons/pwa-512.png",
            "sizes": "512x512",
            "type": "image/png",
            "purpose": "any"
          },
          {
            "src": "icons/maskable-512.png",
            "sizes": "512x512",
            "type": "image/png",
            "purpose": "maskable"
          },
          {
            "src": "icons/icon.svg",
            "sizes": "any",
            "type": "image/svg+xml",
            "purpose": "any"
          }
        ],
        "shortcuts": [
          {
            "name": "Record a sale",
            "short_name": "Sell",
            "description": "Open Quick Sale for the current event",
            "url": "/sale",
            "icons": [
              {
                "src": "icons/pwa-192.png",
                "sizes": "192x192"
              }
            ]
          },
          {
            "name": "Products",
            "url": "/products",
            "icons": [
              {
                "src": "icons/pwa-192.png",
                "sizes": "192x192"
              }
            ]
          }
        ]
      },
      // NOTE: do NOT add includeAssets — globPatterns already covers
      // manifest/icons; duplicating entries with different revisions makes
      // workbox throw "conflicting-entries" and silently kills the SW.
      filename: "ml-sw.js",
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest,woff2}"],
        navigateFallback: "index.html",
        // Dev servers serve unminified assets; allow the shell to be cached anyway.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // App shell + static assets: cache-first (instant offline loads).
            urlPattern: ({ request, sameOrigin }) =>
              sameOrigin && request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "marketlog-assets",
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // API-shaped requests (Supabase REST/auth): network-first.
            // IndexedDB is always primary for user data — this cache is a
            // convenience layer only, never a database.
            urlPattern: ({ url }) =>
              supabaseOrigin !== null ? url.origin === supabaseOrigin : /supabase\.(co|in|net)$/.test(url.hostname),
            handler: "NetworkFirst",
            options: {
              cacheName: "marketlog-api",
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: "module",
        navigateFallback: "index.html",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 3000,
    host: true,
  },
  optimizeDeps: {
    // Only scan the real entry — stray HTML files in tooling folders
    // (skills/, examples/) must not enter the dependency graph.
    entries: ["index.html"],
  },
  preview: {
    port: 3000,
    host: true,
  },
  build: {
    sourcemap: false,
    target: "es2022",
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
