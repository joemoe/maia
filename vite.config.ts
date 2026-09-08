import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      // Wir haben schon ein eigenes, getestetes Manifest + Icon-Links in
      // index.html - der Plugin soll die nicht überschreiben, nur den
      // Service Worker fürs Offline-Caching bereitstellen.
      manifest: false,
      includeAssets: [
        "favicon.ico",
        "favicon-16x16.png",
        "favicon-32x32.png",
        "apple-touch-icon.png",
        "icon-192.png",
        "icon-512.png",
      ],
      workbox: {
        // Alle gebauten Assets (JS/CSS/HTML) + alle Spielgrafiken/Icons
        // fürs Offline-Spielen vorab cachen.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
        // Die Pixelfont kommt von Google Fonts (externe Domain) - wird beim
        // ersten (Online-)Laden separat gecacht, damit sie auch offline
        // verfügbar ist.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-stylesheets",
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              cacheableResponse: { statuses: [0, 200] },
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
        ],
      },
      devOptions: {
        // Erlaubt das Testen des Offline-Verhaltens auch mit "npm run dev".
        enabled: true,
      },
    }),
  ],
});
