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

/**
 * Conceptos que dependen de los datos del cliente (p. ej. un precio de venta por cada producto terminado: el
 * catálogo cambia sin deploy). El módulo dueño registra una función asíncrona que los lista con el RLS del usuario.
 */
export type ProveedorConceptosTarifa = () => Promise<readonly ConceptoTarifaDef[]>;

const proveedores = new Map<ModuloId, ProveedorConceptosTarifa>();

/** Registra el proveedor de conceptos dinámicos de un módulo (idempotente). Lo agrega `src/modules/registry.ts`. */
export function defineProveedorConceptosTarifa(modulo: ModuloId, proveedor: ProveedorConceptosTarifa): void {
  proveedores.set(modulo, proveedor);
}

/** Conceptos dinámicos de los módulos activos del cliente (los lee de su proveedor, uno por módulo). */
export async function conceptosTarifaDinamicosDeModulos(modulos: readonly string[]): Promise<ConceptoTarifaDef[]> {
  const activos = [...proveedores].filter(([modulo]) => modulos.includes(modulo));
  return (await Promise.all(activos.map(([, proveedor]) => proveedor()))).flat();
}

/** Busca un concepto dinámico por su nombre en todos los proveedores (para validar `crearTarifa`). */
export async function buscarConceptoTarifaDinamico(concepto: string): Promise<ConceptoTarifaDef | undefined> {
  for (const proveedor of proveedores.values()) {
    const def = (await proveedor()).find((d) => d.concepto === concepto);
    if (def) return def;
  }
  return undefined;
}

/** Solo para los tests: vacía el registro. */
export function limpiarConceptosTarifa(): void {
  conceptos.clear();
  proveedores.clear();
}
