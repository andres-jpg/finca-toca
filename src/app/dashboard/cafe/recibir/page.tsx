import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSesion } from "@/modules/core/auth/guards";
import { getParametro } from "@/modules/core/parametros/queries/parametros.queries";
import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";
import { CompraForm } from "@/modules/cafe/compras/components/compra-form";
import { fechaHoyEnZona } from "@/modules/cafe/insumos/lib/insumos";
import { PARAMETROS_CAFE } from "@/modules/cafe/parametros";
import { RecepcionForm } from "@/modules/cafe/recepciones/components/recepcion-form";
import { getConfigRecepcion } from "@/modules/cafe/recepciones/queries/recepcion.queries";
import { TipoIngresoSelector, tipoIngresoDesdeQuery } from "@/modules/cafe/recepciones/components/tipo-ingreso-selector";
import { listarTiposCafe } from "@/modules/cafe/tipos/queries/tipos.queries";

/**
 * Recibir café (A-08): una sola entrada para los dos ingresos, marca propia (compra, lote MP) y servicios a terceros
 * (recepción, lote MQ). Reutiliza los formularios de compra y recepción y sus Server Actions, que repiten módulo y
 * rol; el RLS es la frontera real. Gerencia (`viewer`) solo consulta los lotes.
 */
export const metadata = { title: "Recibir café" };

export default async function RecibirCafePage({ searchParams }: { searchParams: Promise<{ tipo?: string | string[] }> }) {
  await requireModuloPagina("cafe.recepcion");
  const { rolTenant, tenant } = await requireSesion();
  if (rolTenant === "viewer") redirect("/dashboard/cafe/lotes");

  const tipo = tipoIngresoDesdeQuery((await searchParams).tipo);
  const fechaHoy = fechaHoyEnZona(tenant.zonaHoraria);
  const puedeAdministrar = rolTenant === "owner" || rolTenant === "admin";

  let formulario: React.ReactNode = null;
  if (tipo === "marca_propia") {
    const [tipos, pesoBultoKg] = await Promise.all([listarTiposCafe(), getParametro(PARAMETROS_CAFE.pesoBultoKg)]);
    const activos = tipos.filter((t) => t.activo).map((t) => ({ id: t.id, nombre: t.nombre }));
    formulario =
      activos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">
          No hay tipos de café activos.{" "}
          {puedeAdministrar ? (
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
        <CompraForm tipos={activos} pesoBultoKg={pesoBultoKg} fechaHoy={fechaHoy} />
      );
  } else if (tipo === "servicio") {
    const config = await getConfigRecepcion();
    formulario = <RecepcionForm config={config} fechaHoy={fechaHoy} puedeAdministrar={puedeAdministrar} />;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-800">Recibir café</h1>
        <p className="mt-0.5 text-sm text-gray-500">Elige el tipo de ingreso: define el lote que se crea y los datos que se piden.</p>
      </div>
      <TipoIngresoSelector valor={tipo} />
      {formulario ?? (
        <p className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">
          Selecciona un tipo de ingreso para continuar.
        </p>
      )}
    </div>
  );
}
