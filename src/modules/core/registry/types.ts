import type { RolLegacy, RolTenant } from "../auth/sesion";
import type { ModuloId } from "../tenants/modulos";
import type { Vertical } from "../tenants/tenant.queries";
import type { IconoNav } from "./iconos";

/**
 * Qué roles ven una entrada. Es una unión para que **toda entrada declare al menos uno** (sin roles,
 * la entrada no la vería nadie, y un menú que falla abierto sería peor):
 * - `roles` (membresía, `rolTenant`): los módulos nuevos (núcleo y café).
 * - `rolesLegacy` (tabla `roles`, `rolLegacy`): las pantallas existentes, con sus `allowedRoles` de siempre.
 * Si una entrada declara las dos, hay que cumplir las dos.
 */
type RolesDeEntrada =
  | { roles: RolTenant[]; rolesLegacy?: RolLegacy[] }
  | { roles?: RolTenant[]; rolesLegacy: RolLegacy[] };

export type NavItemDef = {
  href: string;
  label: string;
  /** Nombre de icono (ver `ICONOS_NAV`); el cliente lo resuelve a componente. */
  icon: IconoNav;
  /** Módulo del que depende la entrada: solo aparece si el cliente lo tiene activo en `tenant_modulos`. */
  modulo: ModuloId;
  /** Encabezado bajo el que se agrupa (orden en `ORDEN_GRUPOS`); sin grupo = al principio, sin encabezado. */
  grupo?: string;
  /** Se oculta en la PWA instalada a quien trabaja en ruta (ver `ocultoEnPWA`). */
  hideInPWA?: boolean;
  /** Posición dentro del grupo (menor primero). */
  orden: number;
} & RolesDeEntrada;

/**
 * Lo que declara cada módulo de la plataforma. `vertical` limita la entrada a los clientes de ese
 * vertical; `'core'` vale para cualquiera (las entradas del núcleo se filtran solo por módulo y rol).
 */
export type ModuleManifest = { vertical: Vertical | "core"; nav: NavItemDef[] };
