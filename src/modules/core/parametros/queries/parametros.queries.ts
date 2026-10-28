import { cache } from "react";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { resolverParametro, type OrigenParametro } from "../lib/valor";
import { getDefinicionParametro, type ParametroDef } from "../registry";

/**
 * Todos los parámetros guardados del cliente actual (RLS: solo los suyos), en UNA consulta por request:
 * leer varios parámetros en la misma petición no cuesta varios round-trips.
 */
const getParametrosGuardados = cache(async function getParametrosGuardados(): Promise<Map<string, unknown>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("parametros").select("clave, valor");
  // Un fallo de lectura NO se disfraza de "usa el defecto": una merma o un rango equivocados pasarían
  // por buenos. Que lo vea quien llama (y Sentry vía el error boundary).
  if (error) throw new Error(`No se pudieron leer los parámetros (${error.code ?? "sin código"})`);
  return new Map(data.map((f) => [f.clave, f.valor as unknown]));
});

function avisarInvalido(clave: string): void {
  // Sin el valor guardado (podría ser dato del cliente): solo qué parámetro.
  Sentry.captureException(new Error(`Parámetro ${clave} inválido: se usa el valor por defecto`), {
    tags: { parametro: clave },
  });
}

/**
 * Valor de un parámetro para el cliente actual. Acepta la clave (la definición sale del registro, que llena
 * `src/modules/registry.ts`) o la propia definición —lo que hace un vertical con las suyas, sin depender de
 * que el registro esté cargado, y con el tipo inferido—. Devuelve el `defecto` si no hay valor guardado o si
 * el guardado no cumple el `schema` (en ese caso lo reporta a Sentry).
 */
export async function getParametro<T>(def: ParametroDef<T>): Promise<T>;
export async function getParametro(clave: string): Promise<unknown>;
export async function getParametro(arg: string | ParametroDef<unknown>): Promise<unknown> {
  const def = typeof arg === "string" ? getDefinicionParametro(arg) : arg;
  if (!def) throw new Error(`Parámetro sin definir: ${String(arg)}. ¿Falta registrarlo con defineParametros()?`);
  const guardados = await getParametrosGuardados();
  const r = resolverParametro(def, guardados.get(def.clave));
  if (r.invalido) avisarInvalido(def.clave);
  return r.valor;
}

export interface ParametroConValor {
  clave: string;
  valor: unknown;
  origen: OrigenParametro;
  invalido: boolean;
}

/** Valores efectivos de varias definiciones (la pantalla de configuración), con una sola lectura. */
export async function getParametrosConValor(defs: readonly ParametroDef<unknown>[]): Promise<ParametroConValor[]> {
  const guardados = await getParametrosGuardados();
  return defs.map((def) => {
    const r = resolverParametro(def, guardados.get(def.clave));
    if (r.invalido) avisarInvalido(def.clave);
    return { clave: def.clave, ...r };
  });
}
