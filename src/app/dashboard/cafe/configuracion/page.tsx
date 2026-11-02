import { redirect } from "next/navigation";
import { requireSesion } from "@/modules/core/auth/guards";
import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";
import { pestanasConfiguracion } from "@/modules/cafe/configuracion/lib/pestanas";

/**
 * Configuración del café (A-07): entrada única del menú. Sus pestañas son pantallas con ruta propia; aquí solo se
 * manda a la primera que el cliente tenga. Solo propietario y administrador.
 */
export const metadata = { title: "Configuración" };

export default async function ConfiguracionPage() {
  await requireModuloPagina("cafe.recepcion");
  const { tenant, rolTenant } = await requireSesion();
  const [primera] = pestanasConfiguracion(tenant.modulos, rolTenant);
  redirect(primera?.href ?? "/dashboard");
}
