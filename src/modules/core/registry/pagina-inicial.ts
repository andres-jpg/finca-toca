import type { PantallaInicio, RolLegacy, RolTenant } from "../auth/sesion";
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

/** Pantallas de inicio configurables de un operativo de café (A-07) y su ruta. `recibir` la crea A-08. */
export const RUTA_PANTALLA_INICIO: Record<PantallaInicio, string> = {
  planta: "/dashboard/cafe/planta",
  recibir: "/dashboard/cafe/recibir",
};

export function paginaInicial(sesion: {
  rolLegacy: RolLegacy | null;
  /** Rol de la membresía; solo cambia la página de inicio de Gerencia de café. */
  rolTenant?: RolTenant | null;
  /** Pantalla de inicio elegida para el usuario en Configuración › Equipo (solo operativos de café). */
  pantallaInicio?: PantallaInicio | null;
  tenant: { vertical: Vertical; modulos?: readonly string[] } | null;
}): string {
  if (sesion.rolLegacy) return PAGINA_INICIAL_POR_ROL[sesion.rolLegacy];
  if (!sesion.tenant) return "/dashboard";
  if (sesion.tenant.vertical === "cafe") {
    const tienePanel = tieneModulo(sesion.tenant.modulos, "cafe.dashboard");
    // Propietario, administrador y Gerencia aterrizan en el Panel (si el cliente lo tiene).
    if ((sesion.rolTenant === "viewer" || sesion.rolTenant === "owner" || sesion.rolTenant === "admin") && tienePanel) {
      return PAGINA_INICIAL_GERENCIA_CAFE;
    }
    // El operativo, en la que tenga configurada; por defecto Planta (si el cliente tiene el módulo).
    if (sesion.rolTenant === "operativo") {
      if (sesion.pantallaInicio) return RUTA_PANTALLA_INICIO[sesion.pantallaInicio];
      if (tieneModulo(sesion.tenant.modulos, "cafe.procesos")) return RUTA_PANTALLA_INICIO.planta;
    }
  }
  return PAGINA_INICIAL_POR_VERTICAL[sesion.tenant.vertical];
}
