import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireSesion } from "@/modules/core/auth/guards";
import { getParametro } from "@/modules/core/parametros/queries/parametros.queries";
import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";
import { EstiloTermico } from "@/modules/core/print/components/estilo-termico";
import { ImprimirButton } from "@/modules/core/print/components/imprimir-button";
import {
  TicketCopias,
  TicketHeader,
  TicketLinea,
  TicketPie,
  TicketSeparador,
} from "@/modules/core/print/components/ticket";
import { parsearAncho } from "@/modules/core/print/lib/ancho";
import { formatearFechaHoraImpresion, parsearCopias } from "@/modules/core/print/lib/opciones";
import { PARAMETRO_IMPRESORA_ANCHO } from "@/modules/core/print/parametros";
import { fechaCorta, fechaHoraZona } from "@/modules/cafe/lotes/lib/formato";
import { ServiciosTiquete } from "@/modules/cafe/remisiones/components/servicios-tiquete";
import {
  LEYENDA_REMISION,
  TITULO_REMISION,
  lineaCliente,
  lineaRecibido,
  resumenEntrega,
  valorReferencia,
} from "@/modules/cafe/remisiones/lib/tiquete";
import { getNitDelCliente, getRecepcionDelLote, getRemision } from "@/modules/cafe/remisiones/queries/remisiones.queries";

interface RemisionPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ancho?: string | string[]; copias?: string | string[] }>;
}

/**
 * Tiquete de la remisión de entrega (HU-F1-13) para la impresora térmica de rollo. `?copias=N` imprime N tiquetes
 * (el original y N-1 «COPIA CLIENTE»; `?copias=2` es el «Imprimir con copia») y `?ancho=58|80` fuerza otro ancho. Todo
 * el texto se formatea aquí, en el servidor y con la zona del cliente (nada de `Intl` del navegador). Es un documento
 * de control interno, no una factura: el valor de los servicios sale como «referencia». Lo puede imprimir cualquier
 * miembro con el módulo `cafe.remisiones` (Gerencia incluida); el RLS esconde las remisiones de otros clientes.
 */
export default async function RemisionTiquetePage({ params, searchParams }: RemisionPageProps) {
  await requireModuloPagina("cafe.remisiones");
  const { tenant } = await requireSesion();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const { ancho: anchoParam, copias: copiasParam } = await searchParams;

  const remision = await getRemision(id.data);
  if (!remision) notFound();

  const [nit, recepcion, anchoCliente] = await Promise.all([
    getNitDelCliente(tenant.id),
    getRecepcionDelLote(remision.loteId),
    getParametro(PARAMETRO_IMPRESORA_ANCHO),
  ]);
  const ancho = parsearAncho(anchoParam) ?? anchoCliente;
  const copias = parsearCopias(copiasParam, 1);
  const resumen = resumenEntrega(remision);
  const impresoEn = formatearFechaHoraImpresion(new Date(), tenant.zonaHoraria);
  const anulada = remision.anulacion !== null;

  return (
    <>
      {ancho !== anchoCliente ? <EstiloTermico ancho={ancho} /> : null}

      <div className="no-print mb-3 space-y-2 border-b border-dashed border-black pb-3 font-sans text-xs">
        <p>
          Remisión <strong>{remision.numero}</strong> · rollo de <strong>{ancho} mm</strong>
          {ancho !== anchoCliente ? ` (el del cliente es ${anchoCliente} mm)` : ""} · {copias} tiquete{copias === 1 ? "" : "s"}.
        </p>
        {anulada && <p className="font-bold text-red-700">Remisión anulada: el tiquete sale marcado como ANULADA.</p>}
        <p>
          <a className="underline" href="?copias=1">solo original</a> · <a className="underline" href="?copias=2">con copia del cliente</a> ·{" "}
          <a className="underline" href={`?copias=${copias}&ancho=80`}>80 mm</a> · <a className="underline" href={`?copias=${copias}&ancho=58`}>58 mm</a>{" "}
          · <Link className="underline" href={`/dashboard/cafe/lotes/${remision.loteId}`}>volver al lote</Link>
        </p>
        <ImprimirButton etiqueta={copias > 1 ? "Imprimir con copia" : "Imprimir"} />
      </div>

      <TicketCopias copias={copias}>
        <TicketHeader nombre={tenant.nombre} nit={nit} logoUrl={tenant.logoUrl} titulo={TITULO_REMISION} />
        <TicketLinea etiqueta="Número" valor={remision.numero} fuerte />
        <div className="text-center text-[8pt]">{LEYENDA_REMISION}</div>
        {anulada && remision.anulacion && (
          <div className="my-1 border-y-2 border-black py-0.5 text-center font-bold tracking-widest">
            ANULADA {fechaHoraZona(remision.anulacion.en, tenant.zonaHoraria)}
          </div>
        )}
        <TicketSeparador />
        <TicketLinea etiqueta="Fecha entrega" valor={fechaCorta(remision.fecha)} />
        <TicketLinea etiqueta="Lote" valor={remision.loteCodigo} />
        <TicketLinea etiqueta="Cliente" valor={lineaCliente(remision)} />
        {recepcion && (
          <TicketLinea
            etiqueta="Recibido"
            valor={lineaRecibido(recepcion.fechaRecepcion, remision.pesoRecibidoKg, recepcion.numBultos)}
          />
        )}
        <TicketSeparador />
        <ServiciosTiquete detalle={remision.detalle} ancho={ancho} />
        <TicketSeparador />
        <TicketLinea etiqueta="Peso entregado" valor={resumen.entregado} fuerte />
        <TicketLinea etiqueta="Merma total" valor={`${resumen.mermaKg} (${resumen.mermaPct})`} />
        <TicketLinea etiqueta="Valor servicios (referencia)" valor={valorReferencia(remision.valorServicios)} />
        {remision.forzada && (
          <>
            <TicketSeparador />
            <div className="text-[9pt] font-bold">Entrega con servicios pendientes</div>
          </>
        )}
        {remision.observaciones && <div className="mt-1 text-[9pt]">Obs.: {remision.observaciones}</div>}
        <TicketSeparador fuerte />
        {remision.recibidoPor && <TicketLinea etiqueta="Recibe" valor={remision.recibidoPor} />}
        <TicketPie impresoEn={impresoEn} etiquetaFirma="Recibido por" />
      </TicketCopias>
    </>
  );
}
