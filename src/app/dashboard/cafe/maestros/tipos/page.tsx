import { redirect } from "next/navigation";
import { requireSesion } from "@/modules/core/auth/guards";
import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";
import { TiposCafeTable } from "@/modules/cafe/tipos/components/tipos-cafe-table";
import { listarTiposCafe } from "@/modules/cafe/tipos/queries/tipos.queries";

/**
 * Catálogo de tipos de café (Consumo, Excelso…). Maestro: solo owner/admin lo ven y lo editan, igual que
 * el RLS de `cafe.tipos_cafe`.
 */
export default async function TiposCafePage() {
  await requireModuloPagina("cafe.recepcion");
  const { rolTenant } = await requireSesion();
  if (rolTenant !== "owner" && rolTenant !== "admin") redirect("/dashboard");

  const tipos = await listarTiposCafe();
  return <TiposCafeTable tipos={tipos} />;
}
