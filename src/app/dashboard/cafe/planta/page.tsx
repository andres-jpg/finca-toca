import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { requireSesion } from "@/modules/core/auth/guards";
import { getParametro } from "@/modules/core/parametros/queries/parametros.queries";
import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";
import { fechaHoyEnZona } from "@/modules/cafe/insumos/lib/insumos";
import { PARAMETROS_CAFE } from "@/modules/cafe/parametros";
import { AvisosPlanta } from "@/modules/cafe/procesos/components/avisos-planta";
import { ColaPlanta } from "@/modules/cafe/procesos/components/cola-planta";
import { calcularAvisos } from "@/modules/cafe/procesos/lib/cola";
import { formatearPeso } from "@/modules/cafe/procesos/lib/numero";
import { getColaPlanta, getInsumosBajoMinimo, getKpisPlantaHoy } from "@/modules/cafe/procesos/queries/planta.queries";
import { horaLlegada } from "@/modules/cafe/lotes/lib/formato";
import { getReaperturasPendientes } from "@/modules/cafe/reapertura/queries/reapertura.queries";

/**
 * Tablero de la planta (A-13 · HU-F1-04): una sola cola por etapa, con los lotes de servicio ya procesados en
 * «Por entregar». La usan owner/admin/operativo; Gerencia (`viewer`) consulta los lotes y vuelve a su lista. La
 * pantalla del lote, la acción y la RPC repiten módulo y rol: el RLS es la frontera real y esconder la
 * pantalla es cosmético.
 */
export const metadata = { title: "Planta" };

/** «Viernes 30 de octubre · 8:42 a. m.» en la zona del cliente. */
function fechaHoraCabecera(zona: string): string {
  const ahora = new Date();
  const partes = new Intl.DateTimeFormat("es", { timeZone: zona, weekday: "long", day: "numeric", month: "long" }).formatToParts(ahora);
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? "";
  return `${p("weekday")} ${p("day")} de ${p("month")} · ${horaLlegada(ahora.toISOString(), zona)}`;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export default async function PlantaPage() {
  await requireModuloPagina("cafe.procesos");
  const { rolTenant, tenant } = await requireSesion();
  if (rolTenant === "viewer") redirect("/dashboard/cafe/lotes");

  const hoy = fechaHoyEnZona(tenant.zonaHoraria);
  const [cola, reaperturas, kpis, insumosBajo, diasSinRecoger] = await Promise.all([
    getColaPlanta(),
    getReaperturasPendientes(),
    getKpisPlantaHoy(hoy),
    getInsumosBajoMinimo(),
    getParametro(PARAMETROS_CAFE.diasSinRecoger),
  ]);

  const enCurso = cola.filter((t) => t.estado !== "listo").length + reaperturas.length;
  const listos = cola.filter((t) => t.estado === "listo" && t.linea === "servicio").length;
  const avisos = calcularAvisos({ tarjetas: cola, insumosBajoMinimo: insumosBajo, diasSinRecoger, hoy });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{fechaHoraCabecera(tenant.zonaHoraria)}</p>
          <h1 className="text-2xl font-bold tracking-tight text-gray-800">Planta</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {plural(enCurso, "lote en curso", "lotes en curso")} · recibido hoy {formatearPeso(kpis.recibidoHoyKg)} kg · tostado hoy {formatearPeso(kpis.tostadoHoyKg)} kg ·{" "}
            {plural(listos, "lote listo", "lotes listos")} para entregar
          </p>
        </div>
        <Link
          href="/dashboard/cafe/recibir"
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-gray-900 px-4 text-base font-semibold text-white outline-none hover:bg-gray-800 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Recibir café
        </Link>
      </div>

      <AvisosPlanta avisos={avisos} />

      <ColaPlanta tarjetas={cola} reaperturas={reaperturas} zonaHoraria={tenant.zonaHoraria} hoy={hoy} />
    </div>
  );
}
