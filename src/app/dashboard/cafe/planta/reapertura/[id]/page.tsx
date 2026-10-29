import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { requireSesion } from "@/modules/core/auth/guards";
import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";
import { getConfigEmpaque } from "@/modules/cafe/empaque/queries/empaque.queries";
import { fechaHoyEnZona } from "@/modules/cafe/insumos/lib/insumos";
import { fechaCorta, formatearPeso } from "@/modules/cafe/procesos/lib/numero";
import { ReaperturaPlanta } from "@/modules/cafe/reapertura/components/reapertura-planta";
import {
  ETIQUETA_ESTADO_REAPERTURA,
  textoReapertura,
  tituloTarjetaReapertura,
} from "@/modules/cafe/reapertura/lib/reapertura";
import { getProcesosDeReaperturas, getReapertura } from "@/modules/cafe/reapertura/queries/reapertura.queries";

/**
 * Trabajo sobre un café reabierto (HU-F1-16): moler y/o empacar, sin repetir trilla ni tostión. Como la cola, es para
 * owner/admin/operativo; Gerencia (`viewer`) consulta el lote y vuelve a su ficha. El origen no se pierde: cada
 * proceso queda ligado a la reapertura y al lote original (se ven en su ficha y en su línea de tiempo).
 */
export default async function ReaperturaPlantaPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModuloPagina("cafe.procesos");
  const { rolTenant, tenant } = await requireSesion();
  if (rolTenant === "viewer") redirect("/dashboard/cafe/lotes");

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const reapertura = await getReapertura(id);
  if (!reapertura) notFound();

  const [config, procesos] = await Promise.all([getConfigEmpaque(reapertura.loteId), getProcesosDeReaperturas([reapertura.id])]);
  const molienda = procesos.find((p) => p.tipo === "molienda" && !p.anulado);
  const empaque = procesos.find((p) => p.tipo === "empaque" && !p.anulado);

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Link href="/dashboard/cafe/planta" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft className="h-4 w-4" />
          Planta
        </Link>

        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 tabular-nums">
              {tituloTarjetaReapertura(reapertura.loteCodigo, reapertura.pesoKg, reapertura.tipoCafe)}
            </h1>
            <p className="text-base text-gray-700">
              {textoReapertura(reapertura.unidades, reapertura.producto, reapertura.pesoKg)}
              {reapertura.motivo && <span className="text-gray-500"> · {reapertura.motivo}</span>}
            </p>
            <p className="text-sm text-gray-500">
              Reabierto el {fechaCorta(reapertura.fecha, true)} ·{" "}
              <span className="font-medium text-gray-700">{formatearPeso(reapertura.pesoDisponibleKg)} kg disponibles</span> para el siguiente paso
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900">
              {ETIQUETA_ESTADO_REAPERTURA[reapertura.estado]}
            </span>
            <Link
              href={`/dashboard/cafe/lotes/${reapertura.loteId}`}
              className="inline-flex min-h-11 items-center rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Ver ficha del lote
            </Link>
          </div>
        </div>
      </div>

      <ReaperturaPlanta
        key={`${reapertura.estado}:${molienda?.id ?? ""}:${empaque?.id ?? ""}`}
        reapertura={reapertura}
        config={config}
        fechaHoy={fechaHoyEnZona(tenant.zonaHoraria)}
        fechaMolienda={molienda ? fechaCorta(molienda.fecha) : null}
      />
    </div>
  );
}
