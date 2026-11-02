import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";
import { RemisionesFiltros } from "@/modules/cafe/remisiones/components/remisiones-filtros";
import { RemisionesPaginacion } from "@/modules/cafe/remisiones/components/remisiones-paginacion";
import { RemisionesTable } from "@/modules/cafe/remisiones/components/remisiones-table";
import { parsearFiltrosRemisiones } from "@/modules/cafe/remisiones/lib/filtros";
import { listarRemisiones } from "@/modules/cafe/remisiones/queries/remisiones.queries";

const RUTA = "/dashboard/cafe/remisiones";

/**
 * Remisiones a terceros (HU-F1-13): listado con filtros (fecha, cliente, estado) y reimpresión del tiquete. Las remisiones
 * se generan desde «Entregar». Las ven todos los miembros (Gerencia incluida); anular es solo de owner/admin (en la ficha
 * del lote). Los filtros viajan por query string para poder compartir la URL. No se maneja estado de pago.
 */
export const metadata = { title: "Remisiones a terceros" };

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
        <h1 className="text-2xl font-bold tracking-tight text-gray-800">Remisiones a terceros</h1>
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
