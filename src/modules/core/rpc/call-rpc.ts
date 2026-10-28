import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { mensajeRpc } from "./mensajes";

/** Esquemas con funciones RPC: `public` (ganadería y cooperativa) y `cafe`. */
export type EsquemaRpc = "public" | "cafe";

/** Resultado de una llamada RPC: el Server Action decide qué hacer con el `code`, no con una excepción. */
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

type Funciones<S extends EsquemaRpc> = Database[S]["Functions"];

/**
 * Argumentos de la función según los tipos generados (`pnpm db:types`). Si la función aún no
 * está en los tipos —hoy `cafe` no tiene ninguna y en `public` solo hay tres de utilidad—
 * se admite un objeto libre, sin validar. En cuanto `db:types` la incluya, `args` y el
 * retorno se validan solos.
 */
export type ArgsRpc<S extends EsquemaRpc, F extends string> =
  F extends keyof Funciones<S>
    ? Funciones<S>[F] extends { Args: infer A }
      ? A
      : never
    : Record<string, unknown>;

/** Retorno de la función según los tipos generados; `unknown` si aún no está en ellos. */
export type RetornoRpc<S extends EsquemaRpc, F extends string> =
  F extends keyof Funciones<S>
    ? Funciones<S>[F] extends { Returns: infer R }
      ? R
      : never
    : unknown;

// Parte del error de PostgREST que se lee. `details` es el `DETAIL` de `raise exception`.
interface ErrorPostgrest {
  code?: string;
  message?: string;
  details?: string | null;
}

// Forma mínima del cliente que usa `callRpc`. Con `schema` y `fn` como cadenas en tiempo de
// ejecución, el `rpc()` genérico de supabase-js no puede resolver sus tipos (la unión de
// esquemas y funciones se queda en `never`), así que se tipa solo lo que se llama. Los
// argumentos y el retorno ya se validaron en la firma de `callRpc`.
interface ClienteRpc {
  schema(esquema: string): {
    rpc(
      fn: string,
      args: Record<string, unknown>,
    ): PromiseLike<{ data: unknown; error: ErrorPostgrest | null }>;
  };
}

// Códigos de negocio válidos: snake_case estable (`stock_insuficiente`). Un `raise exception
// 'texto libre'` también sale con P0001, pero eso es un fallo de la función, no un código.
const CODIGO_NEGOCIO = /^[a-z][a-z0-9_]*$/;

function fallo(code: string, message: string): Result<never> {
  return { ok: false, code, message };
}

function inesperado(esquema: string, fn: string, codigoPg: string): Result<never> {
  // Sin PII: ni los argumentos del usuario ni el mensaje de Postgres (puede citar valores);
  // solo qué función falló y con qué SQLSTATE. El detalle completo está en los logs de Supabase.
  Sentry.captureException(new Error(`RPC ${esquema}.${fn} falló (${codigoPg || "sin código"})`), {
    tags: { rpc: `${esquema}.${fn}`, pg_code: codigoPg || "desconocido" },
  });
  return fallo("error_inesperado", mensajeRpc("error_inesperado"));
}

/** Traduce el error de Postgres/PostgREST al `Result` del wrapper. Exportada para los tests. */
export function traducirErrorRpc(esquema: string, fn: string, error: ErrorPostgrest): Result<never> {
  switch (error.code) {
    case "42501": // insufficient_privilege (RLS o grants)
      return fallo("no_autorizado", mensajeRpc("no_autorizado"));
    case "23505": // unique_violation
      return fallo("duplicado", mensajeRpc("duplicado"));
    case "23503": // foreign_key_violation
      return fallo("referencia_invalida", mensajeRpc("referencia_invalida"));
    case "P0001": // raise exception de la función: message = código, detail = texto
      if (error.message && CODIGO_NEGOCIO.test(error.message)) {
        return fallo(error.message, error.details || mensajeRpc(error.message));
      }
      return inesperado(esquema, fn, "P0001");
    default:
      return inesperado(esquema, fn, error.code ?? "");
  }
}

/**
 * Llama a una función Postgres por RPC con el cliente del servidor (sesión del usuario: RLS
 * aplica) y devuelve un `Result` en vez de lanzar. Es la única vía para escrituras
 * multi-tabla: ver "Escrituras transaccionales" en CLAUDE.md.
 *
 *   const r = await callRpc("cafe", "crear_lote", { p_input: datos });
 *   if (!r.ok) return { error: r.message };   // r.code para ramificar; r.message va al toast
 *
 * `args` y el retorno se tipan con `Database[S]["Functions"][F]`. Mientras la función no esté
 * en los tipos generados `args` es un objeto libre y el retorno `unknown`; se puede afinar
 * pasando `T`: `callRpc<"cafe", "crear_lote", { id: string }>(...)`. Ese `T` es una
 * afirmación: el wrapper no valida en ejecución lo que devuelve Postgres.
 */
export async function callRpc<
  S extends EsquemaRpc,
  F extends string,
  T = RetornoRpc<S, F>,
>(schema: S, fn: F, args: ArgsRpc<S, F>): Promise<Result<T>> {
  try {
    const supabase = (await createClient()) as unknown as ClienteRpc;
    const { data, error } = await supabase.schema(schema).rpc(fn, args as Record<string, unknown>);
    if (error) return traducirErrorRpc(schema, fn, error);
    return { ok: true, data: data as T };
  } catch {
    // Fallo de red/serialización antes de que Postgres responda: tampoco es un error de negocio.
    return inesperado(schema, fn, "");
  }
}
