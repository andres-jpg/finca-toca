import * as Sentry from "@sentry/nextjs";
import { opcionesSentry } from "@/lib/sentry/opciones";

Sentry.init({
  ...opcionesSentry(process.env.NEXT_PUBLIC_SENTRY_DSN),
  // El conductor trabaja sin señal (PWA offline): un fetch que falla sin red es lo esperado,
  // no un error. Los datos quedan en IndexedDB y se reenvían al reconectar.
  ignoreErrors: ["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource."],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
