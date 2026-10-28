import type { RolLegacy, RolTenant } from "../auth/sesion";
import type { Tenant } from "../tenants/tenant.queries";
import { tieneModulo } from "../tenants/modulos";
import type { ModuleManifest, NavItemDef } from "./types";

/**
 * Lo único que hace falta saber de la sesión para armar el menú. `Sesion` y `SesionBase` (ya con
 * cliente activo) lo cumplen; se pide solo esto para poder simularla en los tests.
 */
export interface SesionNav {
  tenant: Pick<Tenant, "vertical" | "modulos">;
  rolTenant: RolTenant | null;
  rolLegacy: RolLegacy | null;
}

/** Orden de los encabezados del menú. Las entradas sin grupo van primero; un grupo desconocido, al final. */
export const ORDEN_GRUPOS = ["Operación", "Maestros", "Informes", "Configuración"] as const;

/**
 * Roles que trabajan en ruta con la PWA instalada: ahí `hideInPWA` esconde la entrada. El administrador
 * de la cooperativa, aunque instale la app, sigue viendo todo el menú.
 */
const ROLES_EN_RUTA: RolLegacy[] = ["cooperativa_user"];

/** ¿Se oculta esta entrada porque la app corre instalada (PWA) y el usuario trabaja en ruta? */
export function ocultoEnPWA(
  item: Pick<NavItemDef, "hideInPWA">,
  rolLegacy: RolLegacy | null,
  pwa: boolean
): boolean {
  return pwa && !!item.hideInPWA && !!rolLegacy && ROLES_EN_RUTA.includes(rolLegacy);
}

function permiteRol(item: NavItemDef, sesion: SesionNav): boolean {
  if (item.roles && !(sesion.rolTenant && item.roles.includes(sesion.rolTenant))) return false;
  if (item.rolesLegacy && !(sesion.rolLegacy && item.rolesLegacy.includes(sesion.rolLegacy))) return false;
  return true;
}

function posicionGrupo(grupo: string | undefined): number {
  if (!grupo) return -1;
  const i = (ORDEN_GRUPOS as readonly string[]).indexOf(grupo);
  return i === -1 ? ORDEN_GRUPOS.length : i;
}

/**
 * Menú de la sesión a partir de una lista de manifiestos (función pura: sin base, sin cookies).
 * Una entrada se muestra si su manifiesto es del vertical del cliente (o del núcleo), el cliente tiene
 * activo su módulo y el rol cumple lo que declara; `pwa` aplica `ocultoEnPWA`. El resultado sale
 * ordenado por grupo y `orden`. Esconder una opción es solo cosmético: la página (`requireModuloPagina`
 * / `checkRoutePermission`) y los Server Actions repiten la comprobación en el servidor.
 */
export function construirNav(
  manifiestos: readonly ModuleManifest[],
  sesion: SesionNav,
  opciones: { pwa?: boolean } = {}
): NavItemDef[] {
  const pwa = opciones.pwa ?? false;
  return manifiestos
    .filter((m) => m.vertical === "core" || m.vertical === sesion.tenant.vertical)
    .flatMap((m) => m.nav)
    .filter(
      (item) =>
        tieneModulo(sesion.tenant.modulos, item.modulo) &&
        permiteRol(item, sesion) &&
        !ocultoEnPWA(item, sesion.rolLegacy, pwa)
    )
    .sort(
      (a, b) =>
        posicionGrupo(a.grupo) - posicionGrupo(b.grupo) ||
        (a.grupo ?? "").localeCompare(b.grupo ?? "") ||
        a.orden - b.orden ||
        a.href.localeCompare(b.href)
    );
}
