import Link from "next/link";
import { AlertTriangle, Check, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatearCOP } from "@/modules/cafe/compras/lib/compra";
import { formatearMedicion, formatearRango } from "@/modules/cafe/recepciones/lib/calidad";
import { calcularAvance, type EtapaAvance } from "../lib/avance";
import { medicionesDeCalidad } from "../lib/calidad-lote";
import { fechaCorta, fechaHoraZona, formatearKg3, formatearMermaPct } from "../lib/formato";
import { etiquetaServicio, etiquetaTueste } from "../lib/servicios";
import type { LoteFicha } from "../queries/lotes.queries";
import { AvanceBarra } from "./avance-barra";
import { EstadoLoteBadge, TipoLoteBadge } from "./insignias";

function Dato({ etiqueta, children, className }: { etiqueta: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm text-gray-800">{children}</dd>
    </div>
  );
}

/**
 * Cabecera de la ficha: lo que entró (cliente o proveedor, tipo de café, fecha, kilos y bultos), la calidad medida
 * contra los rangos de ese día, los servicios contratados con su check, la compra (marca propia), lo que queda en
 * planta y el estado derivado con su avance. Solo presenta lo que ya calculó la base.
 */
export function LoteCabecera({ lote, etapas, zonaHoraria }: { lote: LoteFicha; etapas: EtapaAvance[]; zonaHoraria: string }) {
  const avance = calcularAvance(
    {
      linea: lote.linea,
      estado: lote.estado,
      avanceTexto: lote.avanceTexto,
      serviciosCompletados: lote.serviciosCompletados,
      serviciosRequeridos: lote.serviciosRequeridos,
    },
    etapas,
  );
  const completos = new Set(etapas.filter((e) => e.completo).map((e) => e.tipo));
  const calidad = medicionesDeCalidad(lote);
  const esServicio = lote.linea === "servicio";

  return (
    <section className="space-y-4 rounded-lg border border-stone-200 bg-white p-4 sm:p-5" aria-labelledby="lote-codigo">
      <div className="flex flex-wrap items-center gap-2">
        <h1 id="lote-codigo" className="text-2xl font-bold tracking-tight tabular-nums text-gray-800">
          {lote.codigo}
        </h1>
        <TipoLoteBadge linea={lote.linea} servicios={lote.servicios} />
        <EstadoLoteBadge estado={lote.estado} />
        {lote.tieneDesvio && (
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
            <AlertTriangle className="mr-1 h-3 w-3" aria-hidden />
            Merma desviada
          </Badge>
        )}
      </div>

      {lote.anulacion && (
        <p role="status" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Lote anulado el {fechaHoraZona(lote.anulacion.en, zonaHoraria)}. Motivo: {lote.anulacion.motivo}
        </p>
      )}

      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        <Dato etiqueta={esServicio ? "Cliente" : "Proveedor"}>
          {lote.tercero ?? "—"}
          {lote.terceroIdentificacion && <span className="ml-1 text-gray-500">· {lote.terceroIdentificacion}</span>}
          {/* No hay ficha de tercero: el enlace lleva al listado filtrado por él. */}
          <Link
            href={`/dashboard/cafe/lotes?tercero=${lote.terceroId}`}
            className="mt-0.5 block text-xs text-sky-700 underline underline-offset-2"
          >
            Ver sus lotes
          </Link>
        </Dato>
        <Dato etiqueta="Tipo de café">{lote.tipoCafe ?? "—"}</Dato>
        <Dato etiqueta="Fecha de recepción" className="tabular-nums">
          {fechaCorta(lote.fechaRecepcion)}
        </Dato>
        <Dato etiqueta="Recibido" className="tabular-nums">
          {formatearKg3(lote.pesoRecibidoKg)} kg · {lote.numBultos} {lote.numBultos === 1 ? "bulto" : "bultos"}
        </Dato>

        {calidad.length > 0 && (
          <Dato etiqueta="Calidad" className="sm:col-span-2">
            <ul className="space-y-1">
              {calidad.map((c) => (
                <li key={c.magnitud} className="flex flex-wrap items-center gap-x-2 tabular-nums">
                  <span>
                    {c.magnitud === "humedad" ? "Humedad" : "Densidad"} {formatearMedicion(c.valor)}
                    {c.magnitud === "humedad" ? " %" : ""}
                  </span>
                  {c.alerta ? (
                    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                      <AlertTriangle className="mr-1 h-3 w-3" aria-hidden />
                      {c.alerta === "alta" ? "Alta" : "Baja"}
                      {c.rango ? ` (rango ${formatearRango(c.rango, c.magnitud)})` : ""}
                    </Badge>
                  ) : c.rango ? (
                    <span className="text-xs text-gray-500">dentro del rango {formatearRango(c.rango, c.magnitud)}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </Dato>
        )}

        {esServicio && (
          <Dato etiqueta="Servicios contratados" className="sm:col-span-2">
            <ul className="flex flex-wrap gap-1.5">
              {lote.servicios.map((s) => {
                const hecho = completos.has(s);
                return (
                  <li
                    key={s}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                      hecho ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-stone-200 bg-stone-50 text-stone-600",
                    )}
                  >
                    {hecho ? <Check className="h-3 w-3" aria-hidden /> : <Circle className="h-3 w-3" aria-hidden />}
                    {etiquetaServicio(s)}
                    <span className="sr-only">{hecho ? " (completo)" : " (pendiente)"}</span>
                  </li>
                );
              })}
            </ul>
          </Dato>
        )}
        {lote.nivelTueste && <Dato etiqueta="Nivel de tueste">{etiquetaTueste(lote.nivelTueste)}</Dato>}

        {!esServicio && lote.precioCompraKg !== null && (
          <Dato etiqueta="Precio de compra" className="tabular-nums">
            {formatearCOP(lote.precioCompraKg)} / kg
          </Dato>
        )}
        {!esServicio && lote.valorCompra !== null && (
          <Dato etiqueta="Valor de la compra" className="tabular-nums">
            {formatearCOP(lote.valorCompra)}
          </Dato>
        )}
        {lote.facturaProveedor && <Dato etiqueta="Factura del proveedor">{lote.facturaProveedor}</Dato>}

        <Dato etiqueta="Queda en planta" className="tabular-nums">
          {formatearKg3(lote.pesoActualKg)} kg
        </Dato>
        <Dato etiqueta="Merma total" className="tabular-nums">
          {formatearKg3(lote.mermaTotalKg)} kg · {formatearMermaPct(lote.mermaTotalKg, lote.pesoRecibidoKg)}
        </Dato>
        {esServicio && (
          <Dato etiqueta="Valor de los servicios" className="tabular-nums">
            {formatearCOP(lote.valorServicios)}
            <span className="ml-1 text-xs text-gray-500">(referencia)</span>
          </Dato>
        )}
        <Dato etiqueta="Avance" className="sm:col-span-2 lg:col-span-1">
          <AvanceBarra avance={avance} completo={lote.estado === "listo" || lote.estado === "entregado"} />
        </Dato>
      </dl>

      {lote.observaciones && (
        <p className="rounded-md bg-stone-50 px-3 py-2 text-sm text-gray-700">
          <span className="font-medium">Observaciones: </span>
          {lote.observaciones}
        </p>
      )}
    </section>
  );
}
