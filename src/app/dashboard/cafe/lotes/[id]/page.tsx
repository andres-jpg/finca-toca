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
import { etiquetaServicio } from "@/modules/cafe/lotes/lib/servicios";
import { fechaHoyEnZona } from "@/modules/cafe/insumos/lib/insumos";
import { GenerarRemisionButton } from "@/modules/cafe/remisiones/components/generar-remision-button";
import { RemisionLoteSeccion } from "@/modules/cafe/remisiones/components/remision-lote-seccion";
import { aEventoDeLinea, opcionGenerar } from "@/modules/cafe/remisiones/lib/estado";
import { getRemisionesDeLote } from "@/modules/cafe/remisiones/queries/remisiones.queries";
import type { Remision } from "@/modules/cafe/remisiones/types";
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
 * de owner/admin. En un lote de servicio, «Generar remisión» (CO-32) es de quien opera cuando el lote está listo y
 * de owner/admin también con servicios pendientes; tras entregar, la sección «Remisión de entrega» imprime y anula. Lo escondido es cosmético: cada acción repite módulo y rol y el RLS es la frontera real.
 */
export default async function LotePage({ params }: { params: Promise<{ id: string }> }) {
  await requireModuloPagina("cafe.recepcion");
  const sesion = await requireSesion();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const lote = await getLote(id.data);
  if (!lote) notFound();

  const esAdmin = sesion.rolTenant === "owner" || sesion.rolTenant === "admin";
  const conRemisiones = lote.linea === "servicio" && tieneModulo(sesion.tenant.modulos, "cafe.remisiones");
  const [etapas, bultos, responsables, historial, remisiones] = await Promise.all([
    getEtapas(lote.id),
    getBultos(lote.id),
    getResponsables(lote.id),
    esAdmin ? historialDelLote(lote.id) : Promise.resolve<CambioAuditado[] | null>(null),
    conRemisiones ? remisionesDelLote(lote.id) : Promise.resolve<Remision[]>([]),
  ]);
  const eventos = await getTimeline(lote, bultos, responsables, remisiones.map((r) => aEventoDeLinea(r, responsables)));

  const zona = sesion.tenant.zonaHoraria;
  const sinProcesos = etapas.length === 0;
  const puedeOperar = sesion.rolTenant !== "viewer" && tieneModulo(sesion.tenant.modulos, "cafe.procesos");
  const verPlanta = puedeOperar && lotePendienteDeTrabajo(lote.estado);
  const puedeAnular = esAdmin && sinProcesos && lote.anulacion === null;
  // Remisión: Gerencia (`viewer`) no genera. Esconder el botón es cosmético; la action y la RPC lo exigen.
  const generar = conRemisiones && sesion.rolTenant !== "viewer" ? opcionGenerar({ linea: lote.linea, estado: lote.estado }, esAdmin) : "no";
  const pendientes = lote.serviciosRequeridos
    .filter((s) => !etapas.some((e) => e.tipo === s && e.completo))
    .map((s) => etiquetaServicio(s).toLowerCase())
    .join(", ");

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <Button asChild variant="ghost" className="-ml-3 h-11 w-fit sm:h-9">
          <Link href="/dashboard/cafe/lotes">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Lotes
          </Link>
        </Button>
        {(verPlanta || puedeAnular || generar !== "no") && (
          <div className="flex flex-col gap-2 sm:flex-row">
            {generar !== "no" && (
              <GenerarRemisionButton
                loteId={lote.id}
                loteCodigo={lote.codigo}
                clienteNombre={lote.tercero ?? "el cliente"}
                fechaHoy={fechaHoyEnZona(zona)}
                fechaRecepcion={lote.fechaRecepcion}
                modo={generar === "forzar" ? "forzar" : "normal"}
                pendientes={pendientes}
              />
            )}
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

      <RemisionLoteSeccion remisiones={remisiones} puedeAnular={esAdmin} zonaHoraria={zona} />

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

/**
 * Las remisiones del lote son un extra de la ficha: si la lectura falla (p. ej. la migración de remisiones aún no se
 * aplicó en este entorno mientras se despliega el código), la ficha se muestra igual, sin esa sección.
 */
async function remisionesDelLote(loteId: string): Promise<Remision[]> {
  try {
    return await getRemisionesDeLote(loteId);
  } catch {
    return [];
  }
}

/** El historial es un extra de auditoría: si la RPC falla, la ficha se muestra igual sin esa sección. */
async function historialDelLote(loteId: string): Promise<CambioAuditado[] | null> {
  try {
    return await getHistorialCambios("cafe.lotes", loteId);
  } catch {
    return null;
  }
}
