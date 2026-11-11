import { redirect } from "next/navigation";
import { requireSesion } from "@/modules/core/auth/guards";
import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";
import { getMatrizProductoTerminado } from "@/modules/cafe/empaque/queries/empaque.queries";
import { CargaInicialPanel } from "@/modules/cafe/inventario/components/carga-inicial-panel";
import { getCargasIniciales } from "@/modules/cafe/inventario/queries/ajustes.queries";
import { fechaHoraZona } from "@/modules/cafe/lotes/lib/formato";
import { listarTiposCafe } from "@/modules/cafe/tipos/queries/tipos.queries";

/**
 * Carga inicial del inventario (B-15): solo propietario y administrador, una vez por producto. La acción y la RPC
 * repiten módulo y rol y el RLS es la frontera real; esta redirección evita mostrar un formulario que no se puede usar.
 */
export const metadata = { title: "Carga inicial" };

export default async function CargaInicialPage() {
  await requireModuloPagina("cafe.inventario");
  const { rolTenant, tenant } = await requireSesion();
  if (rolTenant !== "owner" && rolTenant !== "admin") redirect("/dashboard");

  const [{ productos }, tipos, cargas] = await Promise.all([getMatrizProductoTerminado(), listarTiposCafe(), getCargasIniciales()]);
  const fechas = Object.fromEntries(cargas.map((c) => [c.id, fechaHoraZona(c.creadoEn, tenant.zonaHoraria)]));

  return (
    <CargaInicialPanel
      productos={productos.filter((p) => p.activo).map((p) => ({ articuloId: p.articuloId, nombre: p.nombre }))}
      tipos={tipos.filter((t) => t.activo).map((t) => ({ id: t.id, nombre: t.nombre }))}
      cargas={cargas}
      fechasFormateadas={fechas}
    />
  );
}
