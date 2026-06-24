import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react", "react-icons", "dexie"],
  },
};

export default withPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  reloadOnOnline: true,
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
    runtimeCaching: [
      // Cachear el HTML de la página del conductor para que funcione offline al reabrir
      {
        urlPattern: /^\/dashboard\/recolecciones/,
        handler: "NetworkFirst",
        options: {
          cacheName: "pages-cache",
          networkTimeoutSeconds: 3,
          expiration: { maxAgeSeconds: 86400 },
        },
      },
      // API de itinerario: siempre desde la red, nunca cachear.
      // Si se cachea, el SW puede devolver syncedToday del día anterior cuando
      // la conexión es lenta (>networkTimeoutSeconds), importando colecciones
      // de ayer como si fueran de hoy. El offline lo maneja IndexedDB (Dexie).
      {
        urlPattern: /\/api\/itinerario-data/,
        handler: "NetworkOnly",
      },
    ],
  },
})(nextConfig);
