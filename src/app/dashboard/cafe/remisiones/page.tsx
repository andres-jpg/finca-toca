import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";
import { RemisionesFiltros } from "@/modules/cafe/remisiones/components/remisiones-filtros";
import { RemisionesPaginacion } from "@/modules/cafe/remisiones/components/remisiones-paginacion";
import { RemisionesTable } from "@/modules/cafe/remisiones/components/remisiones-table";
import { parsearFiltrosRemisiones } from "@/modules/cafe/remisiones/lib/filtros";
import { listarRemisiones } from "@/modules/cafe/remisiones/queries/remisiones.queries";

const RUTA = "/dashboard/cafe/remisiones";

/**
 * Remisiones de entrega (HU-F1-13): las de trilla y maquila entregadas a clientes, con filtro por fecha, cliente y
 * estado y reimpresión del tiquete (original o con copia). Las remisiones se generan desde la ficha del lote. La ven
 * todos los miembros (Gerencia incluida); anular es de owner/admin y vive en la ficha. Los filtros viajan por query
 * string para poder compartir la URL.
 */
export default async function RemisionesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireModuloPagina("cafe.remisiones");
  const filtros = parsearFiltrosRemisiones(await searchParams);
  const pagina = await listarRemisiones(filtros);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-800">Remisiones</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Entregas de café de trilla y maquila a clientes. Documento de control interno: no es una factura.
        </p>
      </div>

      <RemisionesFiltros key={JSON.stringify(filtros)} filtros={filtros} ruta={RUTA} />
      <RemisionesTable remisiones={pagina.filas} filtros={filtros} />
      <RemisionesPaginacion filtros={filtros} ruta={RUTA} total={pagina.total} totalPaginas={pagina.totalPaginas} />
    </div>
  );
}
