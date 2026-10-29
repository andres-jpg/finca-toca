import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireSesion } from "@/modules/core/auth/guards";
import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";
import { ResumenVentasCards } from "@/modules/cafe/ventas/components/resumen-ventas";
import { VentasFiltros } from "@/modules/cafe/ventas/components/ventas-filtros";
import { VentasPaginacion } from "@/modules/cafe/ventas/components/ventas-paginacion";
import { VentasTable } from "@/modules/cafe/ventas/components/ventas-table";
import { parsearFiltrosVentas } from "@/modules/cafe/ventas/lib/filtros";
import { getResumenVentas, listarVentas } from "@/modules/cafe/ventas/queries/ventas.queries";

const RUTA = "/dashboard/cafe/ventas";

/**
 * Ventas y cortesías de marca propia (HU-F1-07): café ya empacado que sale del inventario, con filtro por fecha, tipo,
 * cliente, estado y «factura pendiente». El total del periodo suma solo ventas vigentes (las cortesías valen $0). La ven
 * todos los miembros (Gerencia incluida); registran owner/admin/operativo y anula owner/admin desde el detalle. Los
 * filtros viajan por query string para poder compartir la URL.
 */
export default async function VentasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireModuloPagina("cafe.ventas");
  const { rolTenant } = await requireSesion();
  const filtros = parsearFiltrosVentas(await searchParams);
  const [pagina, resumen] = await Promise.all([listarVentas(filtros), getResumenVentas(filtros)]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-800">Ventas</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Café de marca propia que sale del inventario: ventas y cortesías. Esta pantalla no emite facturas; la factura electrónica se emite en Aliados.
          </p>
        </div>
        {rolTenant !== "viewer" && (
          <Button asChild className="h-11 shrink-0 sm:h-9">
            <Link href={`${RUTA}/nueva`}>
              <Plus className="mr-1.5 h-4 w-4" />
              Nueva venta
            </Link>
          </Button>
        )}
      </div>

      <ResumenVentasCards resumen={resumen} />
      <VentasFiltros key={JSON.stringify(filtros)} filtros={filtros} ruta={RUTA} />
      <VentasTable ventas={pagina.filas} filtros={filtros} />
      <VentasPaginacion filtros={filtros} ruta={RUTA} total={pagina.total} totalPaginas={pagina.totalPaginas} />
    </div>
  );
}
