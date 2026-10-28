import type { z } from "zod";
import type { ModuloId } from "../tenants/modulos";

/**
 * Cómo se pinta el parámetro en la pantalla de configuración. El valor guardado se valida siempre con el
 * `schema` de la definición; esto solo elige el control.
 * - `numero`: un único número (con `unidad` opcional: "kg", "%").
 * - `rango`: `{ min, max }` (o `null` = "sin configurar").
 */
export type ParametroTipo = "numero" | "rango";

/**
 * Definición de un parámetro configurable por cliente. Las declara CADA módulo en su propio código
 * (`src/modules/cafe/parametros.ts`…); el núcleo no conoce ninguna. El valor guardado vive en
 * `public.parametros` (clave → jsonb); si falta, o no cumple el `schema`, se usa `defecto`.
 */
export interface ParametroDef<T = unknown> {
  /** `<modulo>.<nombre>` en minúsculas, p. ej. `cafe.capacidad_tostadora_kg` (CHECK de la tabla). */
  clave: string;
  /** Módulo dueño: la definición solo se ofrece a los clientes que lo tienen activo. */
  modulo: ModuloId;
  etiqueta: string;
  ayuda?: string;
  schema: z.ZodType<T>;
  /** Valor cuando no hay nada guardado o lo guardado es inválido. `null` = "sin configurar". */
  defecto: T;
  /** Encabezado bajo el que se agrupa en la pantalla. */
  grupo: string;
  tipo: ParametroTipo;
  unidad?: string;
}

const CLAVE = /^[a-z0-9_]+\.[a-z0-9_]+$/;

const definiciones = new Map<string, ParametroDef<unknown>>();

/**
 * Registra las definiciones de parámetros. Quien las agrega es `src/modules/registry.ts` (el único fichero
 * que ve todos los verticales; `core` no puede importarlos). Es idempotente: volver a registrar una clave
 * la reemplaza (recarga en caliente). Falla en voz alta si una definición está mal hecha —clave fuera de
 * formato o un `defecto` que su propio `schema` rechaza—, para que el error salga al arrancar y no el día
 * que alguien lea el parámetro.
 */
export function defineParametros(defs: readonly ParametroDef<unknown>[]): void {
  for (const d of defs) {
    if (!CLAVE.test(d.clave)) throw new Error(`Parámetro con clave inválida: "${d.clave}"`);
    const valido = d.schema.safeParse(d.defecto);
    if (!valido.success) throw new Error(`El defecto del parámetro ${d.clave} no cumple su propio schema`);
    definiciones.set(d.clave, d);
  }
}

export function getDefinicionParametro(clave: string): ParametroDef<unknown> | undefined {
  return definiciones.get(clave);
}

/** Definiciones de los módulos activos del cliente (`Tenant.modulos`), en orden de registro. */
export function definicionesParametrosDeModulos(modulos: readonly string[]): ParametroDef<unknown>[] {
  return [...definiciones.values()].filter((d) => modulos.includes(d.modulo));
}

/** Solo para los tests: vacía el registro. */
export function limpiarDefinicionesParametros(): void {
  definiciones.clear();
}
