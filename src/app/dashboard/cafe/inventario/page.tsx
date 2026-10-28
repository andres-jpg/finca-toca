import { requireSesion } from "@/modules/core/auth/guards";
import { AlertaStockBajo } from "@/modules/core/inventario/components/alerta-stock-bajo";
import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";
import { ProductoTerminadoPanel } from "@/modules/cafe/empaque/components/producto-terminado-panel";
import { getInsumosBajoMinimo, getMatrizProductoTerminado } from "@/modules/cafe/empaque/queries/empaque.queries";

/**
 * Producto terminado por tipo de café × presentación, siempre desglosado (nunca un total mezclado), con el kardex
 * de cada producto y las salidas manuales (muestra, pérdida, ajuste). Las entradas solo llegan por empaque. Debajo,
 * la tarjeta de insumos bajo su mínimo. Lo ve todo miembro (Gerencia, solo lectura); registra salidas
 * owner/admin/operativo; ajusta owner/admin. Las acciones repiten módulo y rol y el RLS es la frontera real.
 */
export default async function InventarioProductoTerminadoPage() {
  await requireModuloPagina("cafe.inventario");
  const { rolTenant, tenant } = await requireSesion();
  const [{ matriz, productos }, insumosBajoMinimo] = await Promise.all([getMatrizProductoTerminado(), getInsumosBajoMinimo()]);

  return (
    <div className="space-y-5">
      <ProductoTerminadoPanel
        matriz={matriz}
        productos={productos}
        puedeRegistrarSalida={rolTenant !== "viewer"}
        puedeAjustar={rolTenant === "owner" || rolTenant === "admin"}
        zonaHoraria={tenant.zonaHoraria}
      />
      <AlertaStockBajo articulos={insumosBajoMinimo} />
    </div>
  );
}
