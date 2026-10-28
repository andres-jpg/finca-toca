import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSesion } from "@/modules/core/auth/guards";
import { getParametro } from "@/modules/core/parametros/queries/parametros.queries";
import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";
import { CompraForm } from "@/modules/cafe/compras/components/compra-form";
import { fechaHoyEnZona } from "@/modules/cafe/insumos/lib/insumos";
import { PARAMETROS_CAFE } from "@/modules/cafe/parametros";
import { listarTiposCafe } from "@/modules/cafe/tipos/queries/tipos.queries";

/**
 * Nueva compra de café para marca propia (HU-F1-01). La hacen owner, admin y operativo; Gerencia (`viewer`)
 * solo consulta los lotes. La action y la RPC repiten la comprobación de módulo y rol, y el RLS es la frontera
 * real: esta redirección es solo para que nadie vea un formulario que no puede usar.
 */
export default async function NuevaCompraPage() {
  await requireModuloPagina("cafe.recepcion");
  const { rolTenant, tenant } = await requireSesion();
  if (rolTenant === "viewer") redirect("/dashboard/cafe/lotes");

  const [tipos, pesoBultoKg] = await Promise.all([
    listarTiposCafe(),
    getParametro(PARAMETROS_CAFE.pesoBultoKg),
  ]);
  const activos = tipos.filter((t) => t.activo).map((t) => ({ id: t.id, nombre: t.nombre }));
  const puedeCrearTipos = rolTenant === "owner" || rolTenant === "admin";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href="/dashboard/cafe/lotes" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 sm:min-h-0">
          <ArrowLeft className="h-4 w-4" />
          Lotes
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-800">Nueva compra de café</h1>
        <p className="mt-0.5 text-sm text-gray-500">Café para marca propia: se crea un lote MP con su código, bultos y costo.</p>
      </div>

      {activos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">
          No hay tipos de café activos.{" "}
          {puedeCrearTipos ? (
            <>
              Actívalos o crea uno en{" "}
              <Link href="/dashboard/cafe/maestros/tipos" className="font-medium text-amber-700 underline-offset-2 hover:underline">
                Tipos de café
              </Link>
              .
            </>
          ) : (
            "Pide a un administrador que los configure."
          )}
        </p>
      ) : (
        <CompraForm tipos={activos} pesoBultoKg={pesoBultoKg} fechaHoy={fechaHoyEnZona(tenant.zonaHoraria)} />
      )}
    </div>
  );
}
