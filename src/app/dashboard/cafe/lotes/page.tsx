import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireSesion } from "@/modules/core/auth/guards";
import { tenantTieneModulo } from "@/modules/core/tenants/tenant.guards";
import { LotesTable } from "@/modules/cafe/lotes/components/lotes-table";
import { listarLotesRecientes } from "@/modules/cafe/lotes/queries/lotes.queries";

/**
 * Página inicial del vertical de café (`PAGINA_INICIAL_POR_VERTICAL`): los lotes más recientes y las formas de
 * registrar café nuevo. CO-29 la completa con filtros y la ficha del lote.
 *
 * Es la excepción a `requireModuloPagina()`: ese guard manda a `/dashboard`, y `/dashboard` manda aquí a
 * quien no tiene rol legacy, así que un cliente al que se le quitara `cafe.recepcion` entraría en un bucle
 * de redirecciones. Sin el módulo se muestra un aviso (y no se lee ningún dato).
 */
export default async function LotesPage() {
  const activo = await tenantTieneModulo("cafe.recepcion");
  const { rolTenant } = await requireSesion();
  // Gerencia (`viewer`) consulta; registrar lo hacen owner, admin y operativo. Esconder el botón es cosmético:
  // la página de destino, la action y la RPC lo vuelven a exigir.
  const puedeRegistrar = activo && rolTenant !== "viewer";
  const lotes = activo ? await listarLotesRecientes() : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-800">Lotes</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {activo ? "Los lotes más recientes de la planta." : "El módulo de recepción no está activo para tu cliente."}
          </p>
        </div>
        {/* Acciones de la cabecera: un botón por cada forma de registrar café nuevo. */}
        {puedeRegistrar && (
          <div className="flex flex-col gap-2 sm:flex-row">
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
          </div>
        )}
      </div>

      {activo && <LotesTable lotes={lotes} />}
    </div>
  );
}
