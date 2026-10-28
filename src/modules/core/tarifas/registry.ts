import type { ModuloId } from "../tenants/modulos";

/** Unidades que admite `public.tarifas.unidad` (CHECK de la tabla). */
export type UnidadTarifa = "kg" | "g" | "unidad" | "litro";

/**
 * Un concepto cobrable con tarifa (`cafe.trilla`, `cafe.tostion`…). Lo declara el módulo dueño en su código
 * (`src/modules/cafe/tarifas.ts`); `public.tarifas` guarda su historia por cliente. Un concepto que ningún
 * módulo declara no aparece en la pantalla ni acepta tarifas nuevas desde la app.
 */
export interface ConceptoTarifaDef {
  /** `<modulo>.<nombre>` en minúsculas (CHECK de la tabla). */
  concepto: string;
  modulo: ModuloId;
  etiqueta: string;
  ayuda?: string;
  unidad: UnidadTarifa;
}

const CONCEPTO = /^[a-z0-9_]+\.[a-z0-9_]+$/;

const conceptos = new Map<string, ConceptoTarifaDef>();

/** Registra los conceptos con tarifa (idempotente, como `defineParametros`). Lo agrega `src/modules/registry.ts`. */
export function defineConceptosTarifa(defs: readonly ConceptoTarifaDef[]): void {
  for (const d of defs) {
    if (!CONCEPTO.test(d.concepto)) throw new Error(`Concepto de tarifa con formato inválido: "${d.concepto}"`);
    conceptos.set(d.concepto, d);
  }
}

export function getConceptoTarifa(concepto: string): ConceptoTarifaDef | undefined {
  return conceptos.get(concepto);
}

/** Conceptos de los módulos activos del cliente, en orden de registro. */
export function conceptosTarifaDeModulos(modulos: readonly string[]): ConceptoTarifaDef[] {
  return [...conceptos.values()].filter((d) => modulos.includes(d.modulo));
}

/** Solo para los tests: vacía el registro. */
export function limpiarConceptosTarifa(): void {
  conceptos.clear();
}
