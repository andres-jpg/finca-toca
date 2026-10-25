import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  // El bundle de cliente no ve SENTRY_ENVIRONMENT: se publica con el mismo valor (lib/sentry/opciones.ts).
  env: {
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT ?? "",
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "react-icons", "dexie"],
  },
};

const conPWA = withPWA({
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

// Sentry envuelve lo último. Sin SENTRY_AUTH_TOKEN no sube sourcemaps ni falla: el build
// de CI y el local quedan igual que antes. SENTRY_ORG / SENTRY_PROJECT los lee el plugin
// del entorno (solo hacen falta en los builds que suben sourcemaps).
export default withSentryConfig(conPWA, {
  silent: !process.env.CI,
  telemetry: false,
  sourcemaps: {
    // Si no hay token, no hay subida: se declara explícito para que no dependa del aviso del plugin.
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
