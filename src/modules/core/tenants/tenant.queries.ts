import { cache } from "react";
import { getSesionBase } from "../auth/sesion";

export type Vertical = "ganaderia" | "cooperativa" | "cafe";
export type TenantEstado = "activo" | "prueba" | "suspendido" | "baja";

export interface Tenant {
  id: string;
  nombre: string;
  slug: string;
  vertical: Vertical;
  plan: string;
  estado: TenantEstado;
  logoUrl: string | null;
  colorPrimario: string | null;
  zonaHoraria: string;
  moneda: string;
  /** Ids de los módulos activos (`tenant_modulos.activo`), p. ej. `ganaderia.arriendos`. */
  modulos: string[];
}

/**
 * Cliente de la sesión (el de `tenant_actual()`), con sus módulos activos. Desde FIN-90 también hay
 * cliente para la cooperativa (Toca Lácteos); solo es `null` sin sesión o sin ninguna membresía/rol.
 *
 * Desde FIN-91 sale de `getSesionBase()` (una sola RPC `mi_sesion()` por request, compartida con el layout
 * y los guards) en vez de pedir el cliente por su cuenta. Para código nuevo, usa `getSesion()`.
 */
export const getTenantActual = cache(async function getTenantActual(): Promise<Tenant | null> {
  return (await getSesionBase())?.tenant ?? null;
});
