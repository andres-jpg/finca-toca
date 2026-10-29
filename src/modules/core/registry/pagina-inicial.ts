import type { RolLegacy, RolTenant } from "../auth/sesion";
import { tieneModulo } from "../tenants/modulos";
import type { Vertical } from "../tenants/tenant.queries";

/**
 * Página a la que se manda a quien no tiene acceso a la que pidió. Los roles legacy conservan la suya
 * de siempre (antes `ROLE_HOME` en `check-permissions.ts`); sin rol legacy (café, un platform admin) la
 * decide el vertical del cliente.
 */
export const PAGINA_INICIAL_POR_ROL: Record<RolLegacy, string> = {
  admin: "/dashboard",
  viewer: "/dashboard",
  user: "/dashboard/extracciones",
  cooperativa_admin: "/dashboard/cooperativa",
  cooperativa_user: "/dashboard/recolecciones",
};

export const PAGINA_INICIAL_POR_VERTICAL: Record<Vertical, string> = {
  ganaderia: "/dashboard/extracciones",
  cooperativa: "/dashboard/cooperativa",
  // Los lotes son la puerta de entrada del café (recepción). Todos los roles la ven: el menú y la página
  // de cada rol ya filtran lo demás.
  cafe: "/dashboard/cafe/lotes",
};

/**
 * Gerencia de café (`viewer`) abre el panel operativo (FIN-115 · CO-34) en vez de los lotes, siempre que el cliente tenga
 * el módulo `cafe.dashboard` (no es módulo base). Sin él el panel redirige a `/dashboard`, que mandaría de vuelta aquí:
 * por eso se comprueba el módulo y, sin él, Gerencia cae en los lotes como todos.
 */
export const PAGINA_INICIAL_GERENCIA_CAFE = "/dashboard/cafe";

export function paginaInicial(sesion: {
  rolLegacy: RolLegacy | null;
  /** Rol de la membresía; solo cambia la página de inicio de Gerencia de café. */
  rolTenant?: RolTenant | null;
  tenant: { vertical: Vertical; modulos?: readonly string[] } | null;
}): string {
  if (sesion.rolLegacy) return PAGINA_INICIAL_POR_ROL[sesion.rolLegacy];
  if (!sesion.tenant) return "/dashboard";
  if (sesion.tenant.vertical === "cafe" && sesion.rolTenant === "viewer" && tieneModulo(sesion.tenant.modulos, "cafe.dashboard")) {
    return PAGINA_INICIAL_GERENCIA_CAFE;
  }
  return PAGINA_INICIAL_POR_VERTICAL[sesion.tenant.vertical];
}
