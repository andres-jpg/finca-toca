import type { RolLegacy, RolTenant, Sesion } from "../auth/sesion";
import type { ModuloId } from "../tenants/modulos";
import type { HojaExcel } from "./generar-excel";

/** Lo que recibe un exportador: la sesión (cliente y rol ya comprobados) y los `searchParams` de la petición. */
export interface ContextoExport {
  sesion: Sesion;
  /** Los mismos parámetros de consulta que usa la pantalla, para que el Excel respete sus filtros. */
  filtros: URLSearchParams;
}

export interface ResultadoExport {
  hojas: HojaExcel[];
  /** Filtros aplicados, en texto legible, para la fila 2 de cada hoja. */
  filtrosAplicados?: Record<string, string>;
  /** Rango (`YYYY-MM-DD`) que cubre la exportación; sale en el nombre del archivo. */
  desde?: string | null;
  hasta?: string | null;
}

/**
 * Un recurso exportable a Excel. Lo declara el módulo dueño en su código (el núcleo trae `terceros`; café
 * añadirá `lotes` en la Fase 1) y lo agrega `src/modules/registry.ts` con `defineExportadores()`, igual que
 * `defineParametros()`: `core` no puede importar los verticales.
 */
export interface ExportadorDef {
  /** Segmento de la URL `/api/export/<recurso>`: minúsculas, cifras y guiones. */
  recurso: string;
  etiqueta: string;
  /** Módulo que el cliente debe tener activo. */
  modulo: ModuloId;
  /** Roles de membresía que pueden exportar. */
  roles: readonly RolTenant[];
  /** Para pantallas legacy: si se declara, además debe cumplirse el rol de la tabla `roles`. */
  rolesLegacy?: readonly RolLegacy[];
  /**
   * Lee los datos (con el cliente de Supabase de la sesión: RLS aísla por cliente) y arma las hojas. Debe
   * paginar con `fetchAllPaginado()`, y puede lanzar `ExportError`.
   */
  generar(ctx: ContextoExport): Promise<ResultadoExport>;
}

const RECURSO = /^[a-z0-9][a-z0-9-]*$/;

const exportadores = new Map<string, ExportadorDef>();

/** Registra exportadores (idempotente: volver a registrar un recurso lo reemplaza). Falla en voz alta si está mal formado. */
export function defineExportadores(defs: readonly ExportadorDef[]): void {
  for (const d of defs) {
    if (!RECURSO.test(d.recurso)) throw new Error(`Exportador con recurso inválido: "${d.recurso}"`);
    if (d.roles.length === 0) throw new Error(`El exportador "${d.recurso}" no declara ningún rol`);
    exportadores.set(d.recurso, d);
  }
}

export function getExportador(recurso: string): ExportadorDef | undefined {
  return exportadores.get(recurso);
}

/** Solo para los tests: vacía el registro. */
export function limpiarExportadores(): void {
  exportadores.clear();
}

export type ResultadoAutorizacion = "ok" | "sin_sesion" | "sin_modulo" | "sin_rol";

/**
 * ¿Puede esta sesión usar este exportador? Función pura (la ruta la traduce a 401/403). Sigue la misma regla
 * que la barra lateral: módulo activo y rol de la membresía; con `rolesLegacy`, también el rol legacy.
 * No sustituye a RLS, que sigue siendo la frontera real de los datos.
 */
export function autorizarExport(
  sesion: Pick<Sesion, "rolTenant" | "rolLegacy"> & { tenant: Pick<Sesion["tenant"], "modulos"> } | null,
  def: Pick<ExportadorDef, "modulo" | "roles" | "rolesLegacy">,
): ResultadoAutorizacion {
  if (!sesion) return "sin_sesion";
  if (!sesion.tenant.modulos.includes(def.modulo)) return "sin_modulo";
  if (!def.roles.includes(sesion.rolTenant)) return "sin_rol";
  if (def.rolesLegacy && (!sesion.rolLegacy || !def.rolesLegacy.includes(sesion.rolLegacy))) return "sin_rol";
  return "ok";
}

/** Los `searchParams` de la petición como texto o `undefined` (primer valor, sin espacios en los bordes). */
export function parametro(filtros: URLSearchParams, nombre: string): string | undefined {
  const v = filtros.get(nombre)?.trim();
  return v ? v : undefined;
}
