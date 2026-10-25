/**
 * Opciones de `Sentry.init` comunes a cliente, servidor y edge.
 *
 * Sin DSN, `enabled` queda en `false`: el SDK no envía nada, y la app y el build funcionan
 * igual (CI, local y cualquier preview sin las variables).
 */
import type { NodeOptions } from "@sentry/nextjs";
import { antesDeEnviar, limpiarBreadcrumb, limpiarSpan } from "./filtros";

/**
 * Equivale al `sendDefaultPii: false` de v10, que en v11 ya no existe: se sustituyó por
 * `dataCollection`, cuyos valores por defecto SÍ recogen cookies, cabeceras, cuerpos HTTP,
 * query strings y datos de consultas. Aquí se apaga todo; `lib/sentry/filtros.ts` lo
 * vuelve a limpiar en `beforeSend` como segunda barrera. El `id` del usuario no se pierde:
 * se pone a mano con `setUser({ id })` (lib/sentry/contexto.ts).
 */
const SIN_DATOS_PERSONALES = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
} satisfies NonNullable<NodeOptions["dataCollection"]>;

export type EntornoSentry = "production" | "staging" | "development";

/**
 * `SENTRY_ENVIRONMENT` manda. `next.config.ts` lo copia a `NEXT_PUBLIC_SENTRY_ENVIRONMENT`
 * para que el bundle de cliente lo vea (es el mismo valor, no una variable más que mantener).
 * Si no está definida: producción solo cuando Next compila para producción.
 */
export function entornoSentry(): EntornoSentry {
  const valor = process.env.SENTRY_ENVIRONMENT || process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT;
  if (valor === "production" || valor === "staging" || valor === "development") return valor;
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

/** 10 % en producción (cuota y coste); 1.0 en staging y desarrollo. */
export function tasaTrazas(entorno: EntornoSentry): number {
  return entorno === "production" ? 0.1 : 1.0;
}

export function opcionesSentry(dsn: string | undefined) {
  const environment = entornoSentry();

  return {
    dsn: dsn || undefined,
    enabled: !!dsn,
    environment,
    tracesSampleRate: tasaTrazas(environment),
    dataCollection: SIN_DATOS_PERSONALES,
    beforeSend: antesDeEnviar,
    beforeSendSpan: limpiarSpan,
    beforeBreadcrumb: limpiarBreadcrumb,
  } satisfies NodeOptions;
}
