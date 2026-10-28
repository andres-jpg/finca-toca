import { requireSesion } from "@/modules/core/auth/guards";
import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";
import { TercerosTable } from "@/modules/core/terceros/components/terceros-table";
import { listarTerceros } from "@/modules/core/terceros/queries/terceros.queries";

/**
 * Maestro de terceros. Solo existe para los clientes con el módulo `core.terceros` activo en
 * `tenant_modulos`; otro cliente que escriba la URL a mano acaba en su dashboard. El alta la hacen
 * owner/admin/operativo y la edición owner/admin (el viewer solo consulta), igual que el RLS.
 */
export default async function TercerosPage() {
  await requireModuloPagina("core.terceros");
  const { rolTenant } = await requireSesion();

  const terceros = await listarTerceros();

  return (
    <TercerosTable
      terceros={terceros}
      puedeCrear={rolTenant !== "viewer"}
      puedeEditar={rolTenant === "owner" || rolTenant === "admin"}
    />
  );
}
