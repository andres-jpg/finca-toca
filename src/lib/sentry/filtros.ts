/**
 * Filtros de Sentry: qué errores NO se reportan y cómo se limpia lo que sí.
 *
 * Fichero **puro a propósito** (solo tipos de Sentry, ni `next/headers` ni Supabase): lo
 * importan por igual la config de cliente, de servidor y de edge, y se puede probar suelto.
 */
import type { Breadcrumb, ErrorEvent, EventHint, NodeOptions } from "@sentry/nextjs";

// @sentry/nextjs no reexporta el tipo del span: se saca de la firma de `beforeSendSpan`.
type SpanJSON = Parameters<NonNullable<NodeOptions["beforeSendSpan"]>>[0];

/**
 * Errores que Next usa para controlar el flujo (`redirect()`, `notFound()`, `forbidden()`…):
 * llegan a Sentry como excepciones pero no son fallos.
 */
const DIGESTS_ESPERADOS = [
  "NEXT_REDIRECT",
  "NEXT_NOT_FOUND",
  "NEXT_HTTP_ERROR_FALLBACK",
  "DYNAMIC_SERVER_USAGE",
  "BAILOUT_TO_CLIENT_SIDE_RENDERING",
];

/** Clase de `AuthorizationError` (`lib/auth/errors.ts`): una denegación no es un bug. */
const NOMBRE_ERROR_AUTORIZACION = "AuthorizationError";

function digestDe(error: unknown): string {
  if (typeof error === "object" && error !== null && "digest" in error) {
    const { digest } = error as { digest?: unknown };
    if (typeof digest === "string") return digest;
  }
  return "";
}

/** ¿Es un error esperado que no debe llegar a Sentry? */
export function esErrorEsperado(event: ErrorEvent, hint?: EventHint): boolean {
  const original = hint?.originalException;

  if (DIGESTS_ESPERADOS.some((d) => digestDe(original).startsWith(d))) return true;
  if (original instanceof Error && original.name === NOMBRE_ERROR_AUTORIZACION) return true;

  // Respaldo por si la excepción original no llega en el hint (p. ej. se serializó antes).
  return (
    event.exception?.values?.some(
      (v) =>
        v.type === NOMBRE_ERROR_AUTORIZACION ||
        (typeof v.value === "string" &&
          DIGESTS_ESPERADOS.some((d) => v.value!.startsWith(d)))
    ) ?? false
  );
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

/** Claves cuyo valor es una URL: se les quita el query string, que puede llevar filtros con datos. */
const CLAVES_URL = new Set(["url", "from", "to", "url.full", "http.url"]);

function sinQuery(url: string): string {
  const i = url.search(/[?#]/);
  return i === -1 ? url : url.slice(0, i);
}

function limpiarValor(valor: unknown, clave: string | undefined, vistos: WeakSet<object>): unknown {
  if (typeof valor === "string") {
    const texto = clave && CLAVES_URL.has(clave) ? sinQuery(valor) : valor;
    return texto.replace(EMAIL, "[email]");
  }
  if (typeof valor !== "object" || valor === null) return valor;
  if (vistos.has(valor)) return "[Circular]";
  vistos.add(valor);

  if (Array.isArray(valor)) return valor.map((v) => limpiarValor(v, undefined, vistos));
  if (valor instanceof Date) return valor;

  const salida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(valor)) salida[k] = limpiarValor(v, k, vistos);
  return salida;
}

/**
 * Deja el evento sin datos personales ni de terceros:
 * - `user`: solo el `id` (nunca email, username ni IP).
 * - `request`: sin cuerpo (formularios), cookies, cabeceras ni query string.
 * - cualquier string: los emails se sustituyen por `[email]` (mensajes de error de
 *   Supabase/Postgres, breadcrumbs, extras…).
 */
export function limpiarEvento(event: ErrorEvent): ErrorEvent {
  const limpio = limpiarValor(event, undefined, new WeakSet()) as ErrorEvent;

  limpio.user = event.user?.id ? { id: event.user.id } : undefined;

  if (limpio.request) {
    const { url, method } = limpio.request;
    limpio.request = { url, method };
  }

  return limpio;
}

/**
 * Los breadcrumbs de consola se descartan (`console.error(err)` imprime objetos de la
 * base con nombres, emails…) y a los demás se les limpia como al resto del evento.
 */
export function limpiarBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category === "console") return null;
  return limpiarValor(breadcrumb, undefined, new WeakSet()) as Breadcrumb;
}

export function antesDeEnviar(event: ErrorEvent, hint?: EventHint): ErrorEvent | null {
  if (esErrorEsperado(event, hint)) return null;
  return limpiarEvento(event);
}

/**
 * Con el `traceLifecycle: 'stream'` por defecto de v11 se envían spans sueltos y
 * `beforeSendTransaction` se ignora: la limpieza de las trazas va aquí.
 */
export function limpiarSpan(span: SpanJSON): SpanJSON {
  return limpiarValor(span, undefined, new WeakSet()) as SpanJSON;
}
