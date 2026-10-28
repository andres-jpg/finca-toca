import { requireSesion } from "@/modules/core/auth/guards";
import { AlertaStockBajo } from "@/modules/core/inventario/components/alerta-stock-bajo";
import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";
import { InsumosPanel } from "@/modules/cafe/insumos/components/insumos-panel";
import { fechaHoyEnZona } from "@/modules/cafe/insumos/lib/insumos";
import { getInsumosEmpaque } from "@/modules/cafe/insumos/queries/insumos.queries";

/**
 * Insumos de empaque (bolsas y etiquetas por tamaño): stock actual, mínimo por insumo, compras y kardex.
 * Lo ve todo miembro (Gerencia, solo lectura); compra owner/admin/operativo; maestro y ajustes, owner/admin.
 * Las acciones repiten la comprobación de módulo y rol y el RLS es la frontera real: ocultar botones es cosmético.
 */
export default async function InsumosPage() {
  await requireModuloPagina("cafe.inventario");
  const { rolTenant, tenant } = await requireSesion();
  const insumos = await getInsumosEmpaque();

  // La alerta cuenta solo lo activo: un insumo desactivado ya no se usa y no debe pedir compra.
  const bajoMinimo = insumos.filter((i) => i.activo && i.bajo_minimo);

  return (
    <div className="space-y-5">
      <AlertaStockBajo articulos={bajoMinimo} />
      <InsumosPanel
        insumos={insumos}
        puedeComprar={rolTenant !== "viewer"}
        puedeAdministrar={rolTenant === "owner" || rolTenant === "admin"}
        fechaHoy={fechaHoyEnZona(tenant.zonaHoraria)}
        zonaHoraria={tenant.zonaHoraria}
      />
    </div>
  );
}
