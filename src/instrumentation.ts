import * as Sentry from "@sentry/nextjs";

export async function register() {
  // En Preview de Vercel Sentry no se inicializa (ni en funciones ni en el proxy): ahorra CPU activa.
  if (process.env.VERCEL_ENV === "preview") return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// Errores de Server Components, Server Actions y route handlers.
export const onRequestError = Sentry.captureRequestError;
