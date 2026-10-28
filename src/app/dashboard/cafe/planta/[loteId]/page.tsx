import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { z } from "zod";
import { requireSesion } from "@/modules/core/auth/guards";
import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";
import { fechaHoyEnZona } from "@/modules/cafe/insumos/lib/insumos";
import { ETIQUETA_ALERTA_CALIDAD } from "@/modules/cafe/recepciones/lib/calidad";
import { getConfigEmpaque } from "@/modules/cafe/empaque/queries/empaque.queries";
import { HistorialProcesos } from "@/modules/cafe/procesos/components/historial-procesos";
import { NivelTuesteChip } from "@/modules/cafe/procesos/components/nivel-tueste-chip";
import { ProcesoPlantaForm } from "@/modules/cafe/procesos/components/proceso-form";
import { fechaCorta, formatearPeso } from "@/modules/cafe/procesos/lib/numero";
import { evaluarPaso, pasoInicial } from "@/modules/cafe/procesos/lib/pasos";
import { getLoteParaProceso, getPesoDisponible } from "@/modules/cafe/procesos/queries/planta.queries";

const ETIQUETA_LINEA = { servicio: "Servicio (cliente)", marca_propia: "Marca propia" } as const;

/**
 * Formulario de proceso de un lote (HU-F1-04): el siguiente paso preseleccionado, la selección de bultos, la
 * merma en vivo y, debajo, el historial con la anulación para owner/admin. Como la cola, es para owner/admin/
 * operativo; la ficha completa del lote (trazabilidad) es de CO-29.
 */
export default async function ProcesoLotePage({ params }: { params: Promise<{ loteId: string }> }) {
  await requireModuloPagina("cafe.procesos");
  const { rolTenant, tenant } = await requireSesion();
  if (rolTenant === "viewer") redirect("/dashboard/cafe/lotes");

  const { loteId } = await params;
  if (!z.uuid().safeParse(loteId).success) notFound();

  const datos = await getLoteParaProceso(loteId);
  if (!datos) notFound();
  const { lote, bultos, procesos, config } = datos;

  const lotePasos = { linea: lote.linea, servicios: lote.servicios };
  const tipoInicial = lote.anulado ? null : pasoInicial(lotePasos, bultos, lote.serviciosRequeridos);
  const bultoIdsIniciales = tipoInicial ? evaluarPaso(lotePasos, tipoInicial, bultos).elegibles : [];
  // El peso de entrada llega precargado: lo que salió del paso previo (HU-03 c5) o la suma de los bultos.
  const pesoInicial = tipoInicial ? await getPesoDisponible(lote.id, tipoInicial, bultoIdsIniciales) : null;

  // El empaque de marca propia pide las presentaciones (bolsas activas) con el stock de bolsas y etiquetas.
  const empaque = lote.linea === "marca_propia" && !lote.anulado ? await getConfigEmpaque(lote.id) : undefined;

  const esAdmin = rolTenant === "owner" || rolTenant === "admin";
  // Al registrar o anular, la página se vuelve a pedir: cambiar la clave reinicia el formulario con los datos nuevos.
  const clave = `${lote.estado}:${procesos.map((p) => `${p.id}${p.anulado ? "x" : ""}`).join(",")}`;

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Link href="/dashboard/cafe/planta" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft className="h-4 w-4" />
          Planta
        </Link>

        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 tabular-nums">{lote.codigo}</h1>
            <p className="text-base text-gray-700">
              {lote.tercero}
              {lote.tipoCafe && <span className="text-gray-500"> · {lote.tipoCafe}</span>}
              <span className="text-gray-500"> · {ETIQUETA_LINEA[lote.linea]}</span>
            </p>
            <p className="text-sm text-gray-500">
              Recibido el {fechaCorta(lote.fechaRecepcion, true)} · {lote.numBultos} {lote.numBultos === 1 ? "bulto" : "bultos"} ·{" "}
              {formatearPeso(lote.pesoRecibidoKg)} kg recibidos · <span className="font-medium text-gray-700">{formatearPeso(lote.pesoActualKg)} kg disponibles</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {lote.nivelTueste && <NivelTuesteChip nivel={lote.nivelTueste} className="text-base" />}
            <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">Avance {lote.avanceTexto}</span>
            <Link
              href={`/dashboard/cafe/lotes/${lote.id}`}
              className="inline-flex min-h-11 items-center rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Ver ficha del lote
            </Link>
          </div>
        </div>

        {lote.alertasCalidad.length > 0 && (
          <p className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            Calidad al recibir: {lote.alertasCalidad.map((a) => ETIQUETA_ALERTA_CALIDAD[a] ?? a).join(", ")}.
          </p>
        )}
      </div>

      {lote.anulado ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Este lote está anulado: ya no admite procesos.
        </p>
      ) : (
        <ProcesoPlantaForm
          key={clave}
          lote={lote}
          bultos={bultos}
          config={config}
          fechaHoy={fechaHoyEnZona(tenant.zonaHoraria)}
          puedeConfigurarTarifas={esAdmin}
          tipoInicial={tipoInicial}
          bultoIdsIniciales={bultoIdsIniciales}
          pesoDisponibleInicial={pesoInicial?.ok ? pesoInicial.data : null}
          empaque={empaque}
        />
      )}

      <HistorialProcesos procesos={procesos} puedeAnular={esAdmin && !lote.anulado} mostrarValor={lote.linea === "servicio"} />
    </div>
  );
}
