import { getSesion } from "@/modules/core/auth/sesion";
import { pestanasConfiguracion } from "../lib/pestanas";
import { ConfiguracionTabsNav } from "./configuracion-tabs-nav";

/**
 * Pestañas de Configuración sobre las pantallas que la componen. Se monta desde el `layout.tsx` de cada una; no
 * pinta nada fuera del café ni para quien no es propietario/administrador (esas pantallas se ven como siempre).
 */
export async function ConfiguracionTabs() {
  const sesion = await getSesion();
  if (!sesion || sesion.tenant.vertical !== "cafe") return null;
  const pestanas = pestanasConfiguracion(sesion.tenant.modulos, sesion.rolTenant);
  if (pestanas.length === 0) return null;
  return <ConfiguracionTabsNav pestanas={pestanas} />;
}
