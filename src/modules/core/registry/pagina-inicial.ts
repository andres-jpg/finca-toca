import type { RolLegacy } from "../auth/sesion";
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

export function paginaInicial(sesion: { rolLegacy: RolLegacy | null; tenant: { vertical: Vertical } | null }): string {
  if (sesion.rolLegacy) return PAGINA_INICIAL_POR_ROL[sesion.rolLegacy];
  return sesion.tenant ? PAGINA_INICIAL_POR_VERTICAL[sesion.tenant.vertical] : "/dashboard";
}
