import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireSesion } from "@/modules/core/auth/guards";
import { tenantTieneModulo } from "@/modules/core/tenants/tenant.guards";
import { LotesFiltros } from "@/modules/cafe/lotes/components/lotes-filtros";
import { LotesPaginacion } from "@/modules/cafe/lotes/components/lotes-paginacion";
import { LotesPestanas } from "@/modules/cafe/lotes/components/lotes-pestanas";
import { LotesTable } from "@/modules/cafe/lotes/components/lotes-table";
import { parsearFiltros, serializarFiltros } from "@/modules/cafe/lotes/lib/filtros";
import { listarLotes } from "@/modules/cafe/lotes/queries/lotes.queries";

const RUTA = "/dashboard/cafe/lotes";

/**
 * Página inicial del vertical de café (`PAGINA_INICIAL_POR_VERTICAL`): el listado de lotes con su avance, los
 * filtros (por query string, para compartir la URL y para el Excel de CO-35) y las formas de registrar café nuevo.
 * Cada código lleva a la ficha del lote. Todos los miembros lo ven; solo `viewer` no ve los botones de registro.
 *
 * Es la excepción a `requireModuloPagina()`: ese guard manda a `/dashboard`, y `/dashboard` manda aquí a
 * quien no tiene rol legacy, así que un cliente al que se le quitara `cafe.recepcion` entraría en un bucle
 * de redirecciones. Sin el módulo se muestra un aviso (y no se lee ningún dato).
 */
export default async function LotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const activo = await tenantTieneModulo("cafe.recepcion");
  const { rolTenant } = await requireSesion();
  const filtros = parsearFiltros(await searchParams);
  // Gerencia (`viewer`) consulta; registrar lo hacen owner, admin y operativo. Esconder el botón es cosmético:
  // la página de destino, la action y la RPC lo vuelven a exigir.
  const puedeRegistrar = activo && rolTenant !== "viewer";
  const pagina = activo ? await listarLotes(filtros) : null;
  const exportQuery = serializarFiltros(filtros, { conPagina: false });
  const exportHref = `/api/export/cafe-lotes${exportQuery ? `?${exportQuery}` : ""}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-800">Lotes</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {activo ? "Todos los lotes de la planta, con su avance." : "El módulo de recepción no está activo para tu cliente."}
          </p>
        </div>
        {/* Acciones de la cabecera: un botón por cada forma de registrar café nuevo. */}
        {activo && (
          <div className="flex flex-col gap-2 sm:flex-row">
            {puedeRegistrar && (
              <>
                <Button asChild className="h-11 w-full sm:h-9 sm:w-auto">
                  <Link href="/dashboard/cafe/lotes/nueva-compra">
                    <Plus className="mr-2 h-4 w-4" />
                    Nueva compra
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-11 w-full sm:h-9 sm:w-auto">
                  <Link href="/dashboard/cafe/lotes/nueva-recepcion">
                    <Plus className="mr-2 h-4 w-4" />
                    Nueva recepción
                  </Link>
                </Button>
              </>
            )}
            {/* Excel de lotes y procesos (CO-35) con los mismos filtros de la URL, sin la página. Un `<a>` normal:
                es una descarga, no una navegación de Next. Todos los roles, Gerencia incluida. */}
            <Button asChild variant="outline" className="h-11 w-full sm:h-9 sm:w-auto">
              <a href={exportHref}>
                <Download className="mr-2 h-4 w-4" />
                Exportar
              </a>
            </Button>
          </div>
        )}
      </div>

      {pagina && (
        <>
          <LotesPestanas filtros={filtros} ruta={RUTA} />
          <LotesFiltros key={JSON.stringify(filtros)} filtros={filtros} ruta={RUTA} />
          <LotesTable lotes={pagina.filas} filtros={filtros} />
          <LotesPaginacion filtros={filtros} ruta={RUTA} total={pagina.total} totalPaginas={pagina.totalPaginas} />
        </>
      )}
    </div>
  );
}
