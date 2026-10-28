import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Factory } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { getHistorialCambios, type CambioAuditado } from "@/modules/core/auditoria/actions/historial.actions";
import { HistorialCambios } from "@/modules/core/auditoria/components/historial-cambios";
import { requireSesion } from "@/modules/core/auth/guards";
import { tieneModulo } from "@/modules/core/tenants/modulos";
import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";
import { AnularLoteButton } from "@/modules/cafe/lotes/components/anular-lote-button";
import { BultosTabla } from "@/modules/cafe/lotes/components/bultos-tabla";
import { EtapasTabla } from "@/modules/cafe/lotes/components/etapas-tabla";
import { LoteCabecera } from "@/modules/cafe/lotes/components/lote-cabecera";
import { LoteTimeline } from "@/modules/cafe/lotes/components/lote-timeline";
import { lotePendienteDeTrabajo } from "@/modules/cafe/lotes/lib/estado";
import {
  getBultos,
  getEtapas,
  getLote,
  getResponsables,
  getTimeline,
} from "@/modules/cafe/lotes/queries/lotes.queries";

/**
 * Ficha del lote: de dónde viene, qué procesos tuvo, cuánta merma y cuánto queda (HU-F1-05 y HU-F1-12). Todo sale de
 * las vistas `v_lotes`, `v_lote_etapas` y `v_bultos_estado`: nada se guarda a mano. La ven todos los miembros
 * (Gerencia sin botones); «Ir a planta» es de quien opera, «Anular lote» de owner/admin y el historial de cambios
 * de owner/admin. Lo escondido es cosmético: cada acción repite módulo y rol y el RLS es la frontera real.
 */
export default async function LotePage({ params }: { params: Promise<{ id: string }> }) {
  await requireModuloPagina("cafe.recepcion");
  const sesion = await requireSesion();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const lote = await getLote(id.data);
  if (!lote) notFound();

  const esAdmin = sesion.rolTenant === "owner" || sesion.rolTenant === "admin";
  const [etapas, bultos, responsables, historial] = await Promise.all([
    getEtapas(lote.id),
    getBultos(lote.id),
    getResponsables(lote.id),
    esAdmin ? historialDelLote(lote.id) : Promise.resolve<CambioAuditado[] | null>(null),
  ]);
  const eventos = await getTimeline(lote, bultos, responsables);

  const zona = sesion.tenant.zonaHoraria;
  const sinProcesos = etapas.length === 0;
  const puedeOperar = sesion.rolTenant !== "viewer" && tieneModulo(sesion.tenant.modulos, "cafe.procesos");
  const verPlanta = puedeOperar && lotePendienteDeTrabajo(lote.estado);
  const puedeAnular = esAdmin && sinProcesos && lote.anulacion === null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <Button asChild variant="ghost" className="-ml-3 h-11 w-fit sm:h-9">
          <Link href="/dashboard/cafe/lotes">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Lotes
          </Link>
        </Button>
        {(verPlanta || puedeAnular) && (
          <div className="flex flex-col gap-2 sm:flex-row">
            {verPlanta && (
              <Button asChild className="h-11 sm:h-9">
                <Link href={`/dashboard/cafe/planta/${lote.id}`}>
                  <Factory className="mr-2 h-4 w-4" />
                  Ir a planta
                </Link>
              </Button>
            )}
            {puedeAnular && <AnularLoteButton loteId={lote.id} codigo={lote.codigo} />}
          </div>
        )}
      </div>

      <LoteCabecera lote={lote} etapas={etapas} zonaHoraria={zona} />

      <section className="space-y-2" aria-labelledby="titulo-etapas">
        <h2 id="titulo-etapas" className="text-lg font-semibold text-gray-800">
          Resumen por etapa
        </h2>
        <EtapasTabla requeridos={lote.serviciosRequeridos} etapas={etapas} esServicio={lote.linea === "servicio"} />
      </section>

      <section className="space-y-2" aria-labelledby="titulo-timeline">
        <h2 id="titulo-timeline" className="text-lg font-semibold text-gray-800">
          Línea de tiempo
        </h2>
        <LoteTimeline eventos={eventos} zonaHoraria={zona} />
      </section>

      <section className="space-y-2" aria-labelledby="titulo-bultos">
        <h2 id="titulo-bultos" className="text-lg font-semibold text-gray-800">
          Bultos
        </h2>
        <BultosTabla bultos={bultos} pasosDelLote={lote.serviciosRequeridos} />
      </section>

      {historial && (
        <section className="space-y-2" aria-labelledby="titulo-historial">
          <h2 id="titulo-historial" className="text-lg font-semibold text-gray-800">
            Historial de cambios
          </h2>
          <HistorialCambios cambios={historial} />
        </section>
      )}
    </div>
  );
}

/** El historial es un extra de auditoría: si la RPC falla, la ficha se muestra igual sin esa sección. */
async function historialDelLote(loteId: string): Promise<CambioAuditado[] | null> {
  try {
    return await getHistorialCambios("cafe.lotes", loteId);
  } catch {
    return null;
  }
}
