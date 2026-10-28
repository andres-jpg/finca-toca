import { AlertTriangle, ArrowLeftRight, Ban, Cog, FileText, Flame, Package, Truck, Wheat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatearCOP, formatearKg } from "@/modules/cafe/compras/lib/compra";
import { fechaCorta, fechaHoraZona, formatearKg3, formatearMermaPct, formatearPct } from "../lib/formato";
import {
  etiquetaMotivoMovimiento,
  listaBultos,
  mermaPctBache,
  type EventoLinea,
  type MovimientoLinea,
  type ProcesoLinea,
  type RecepcionLinea,
  type RemisionLinea,
} from "../lib/linea-tiempo";
import { etiquetaServicio, etiquetaTueste } from "../lib/servicios";
import type { TipoProceso } from "../types";

// Línea de tiempo cronológica del lote. Mismo patrón visual que `EventsTimeline` de ganadería (tarjeta con icono,
// etiqueta en mayúsculas y fecha), COPIADO aquí porque las fronteras de ESLint impiden importar de `ganaderia` o
// `src/features`. Es un componente de servidor: los baches se despliegan con `<details>`, sin JavaScript.

type Config = { icon: React.ElementType; color: string; bg: string };

const CONFIG_PROCESO: Record<TipoProceso, Config> = {
  trilla: { icon: Wheat, color: "text-stone-700", bg: "bg-stone-50 border-stone-200" },
  tostion: { icon: Flame, color: "text-orange-600", bg: "bg-orange-50 border-orange-200" },
  molienda: { icon: Cog, color: "text-indigo-600", bg: "bg-indigo-50 border-indigo-200" },
  empaque: { icon: Package, color: "text-teal-600", bg: "bg-teal-50 border-teal-200" },
};
const CONFIG_RECEPCION: Config = { icon: Truck, color: "text-sky-600", bg: "bg-sky-50 border-sky-200" };
const CONFIG_MOVIMIENTO: Config = { icon: ArrowLeftRight, color: "text-violet-600", bg: "bg-violet-50 border-violet-200" };
const CONFIG_REMISION: Config = { icon: FileText, color: "text-teal-700", bg: "bg-teal-50 border-teal-200" };
const CONFIG_ANULACION: Config = { icon: Ban, color: "text-red-700", bg: "bg-red-50 border-red-200" };

function Tarjeta({ config, titulo, fecha, children, quien, atenuada = false }: {
  config: Config;
  titulo: string;
  fecha: string;
  children: React.ReactNode;
  quien?: string | null;
  atenuada?: boolean;
}) {
  const Icono = config.icon;
  return (
    <li className={cn("flex gap-3 rounded-lg border p-3", config.bg, atenuada && "opacity-70")}>
      <div className={cn("mt-0.5 shrink-0", config.color)}>
        <Icono className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={cn("text-xs font-semibold uppercase tracking-wide", config.color)}>{titulo}</span>
          <span className="text-xs tabular-nums text-gray-500">{fecha}</span>
          {quien && <span className="text-xs text-gray-500">· {quien}</span>}
        </div>
        {children}
      </div>
    </li>
  );
}

function Recepcion({ datos }: { datos: RecepcionLinea }) {
  return (
    <Tarjeta config={CONFIG_RECEPCION} titulo={datos.linea === "marca_propia" ? "Compra" : "Recepción"} fecha={fechaCorta(datos.fecha)} quien={datos.creadoPor}>
      <p className="text-sm text-gray-800">
        <span className="tabular-nums font-medium">{formatearKg3(datos.pesoRecibidoKg)} kg</span> en {datos.numBultos}{" "}
        {datos.numBultos === 1 ? "bulto" : "bultos"}
        {datos.tipoCafe ? ` · ${datos.tipoCafe}` : ""}
        {datos.tercero ? ` · ${datos.linea === "servicio" ? "cliente" : "proveedor"}: ${datos.tercero}` : ""}
      </p>
    </Tarjeta>
  );
}

function Proceso({ datos, numBultosLote }: { datos: ProcesoLinea; numBultosLote: number }) {
  const anulado = datos.anulacion !== null;
  return (
    <Tarjeta
      config={CONFIG_PROCESO[datos.tipo]}
      titulo={etiquetaServicio(datos.tipo)}
      fecha={fechaCorta(datos.fecha)}
      quien={datos.creadoPor}
      atenuada={anulado}
    >
      <div className={cn("space-y-1", anulado && "line-through decoration-gray-400")}>
        <p className="text-sm text-gray-800">
          <span className="tabular-nums">
            {formatearKg3(datos.pesoEntradaKg)} → {formatearKg3(datos.pesoSalidaKg)} kg
          </span>
          <span className="tabular-nums text-gray-600">
            {" "}
            · merma {formatearKg3(datos.mermaKg)} kg ({formatearMermaPct(datos.mermaKg, datos.pesoEntradaKg)})
          </span>
        </p>
        <p className="text-xs text-gray-600">
          {datos.bultos.length > 0 && <>Bultos: {listaBultos(datos.bultos, numBultosLote)}</>}
          {datos.nivelTueste && <> · Tueste {etiquetaTueste(datos.nivelTueste).toLowerCase()}</>}
          {datos.valor > 0 && (
            <>
              {" "}
              · Valor <span className="tabular-nums">{formatearCOP(datos.valor)}</span> (tarifa{" "}
              <span className="tabular-nums">{formatearCOP(datos.tarifaKg)}</span>/kg)
            </>
          )}
        </p>
        {datos.observaciones && <p className="text-xs italic text-gray-600">{datos.observaciones}</p>}
      </div>

      {datos.desvio && !anulado && (
        <p className="flex flex-wrap items-center gap-1 text-xs font-medium text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          Merma desviada
          {datos.mermaReferenciaPct !== null &&
            ` (referencia ${formatearPct(datos.mermaReferenciaPct)}${datos.toleranciaPts !== null ? ` ± ${formatearPct(datos.toleranciaPts).replace(" %", " pts")}` : ""})`}
        </p>
      )}

      {anulado && datos.anulacion && (
        <p className="flex flex-wrap items-center gap-1 text-xs font-medium text-red-700">
          <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Anulado</Badge>
          {fechaCorta(datos.anulacion.en.slice(0, 10))}
          {datos.anulacion.por ? ` · ${datos.anulacion.por}` : ""} · {datos.anulacion.motivo}
        </p>
      )}

      {datos.baches.length > 0 && (
        <details className="text-sm">
          <summary className="min-h-6 cursor-pointer text-xs font-medium text-orange-700 underline-offset-2 hover:underline">
            {datos.baches.length} {datos.baches.length === 1 ? "bache" : "baches"}
          </summary>
          <div className="mt-2 overflow-x-auto rounded-md border border-orange-200 bg-white">
            <table className="w-full text-xs">
              <thead className="bg-orange-50 text-left text-gray-600">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Bache</th>
                  <th className="px-2 py-1.5 text-right font-medium">Kg entrada</th>
                  <th className="px-2 py-1.5 text-right font-medium">Kg salida</th>
                  <th className="px-2 py-1.5 text-right font-medium">Merma</th>
                  <th className="px-2 py-1.5 text-right font-medium">Temp. °C</th>
                </tr>
              </thead>
              <tbody>
                {datos.baches.map((b) => (
                  <tr key={b.numero} className="border-t border-orange-100 tabular-nums">
                    <td className="px-2 py-1">{b.numero}</td>
                    <td className="px-2 py-1 text-right">{formatearKg3(b.pesoEntradaKg)}</td>
                    <td className="px-2 py-1 text-right">{formatearKg3(b.pesoSalidaKg)}</td>
                    <td className="px-2 py-1 text-right">{formatearPct(mermaPctBache(b))}</td>
                    <td className="px-2 py-1 text-right">{b.temperaturaC ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </Tarjeta>
  );
}

function Movimiento({ datos }: { datos: MovimientoLinea }) {
  const signo = datos.cantidad > 0 ? "+" : datos.cantidad < 0 ? "−" : "";
  return (
    <Tarjeta config={CONFIG_MOVIMIENTO} titulo="Inventario" fecha={fechaCorta(datos.fecha)} quien={datos.creadoPor}>
      <p className="text-sm text-gray-800">
        {datos.articulo}: <span className="tabular-nums font-medium">{signo}{formatearKg(Math.abs(datos.cantidad))}</span>
        <span className="text-gray-600"> · {etiquetaMotivoMovimiento(datos.motivo)}</span>
      </p>
      {datos.observaciones && <p className="text-xs italic text-gray-600">{datos.observaciones}</p>}
    </Tarjeta>
  );
}

function Remision({ datos }: { datos: RemisionLinea }) {
  const anulada = datos.anulacion !== null;
  return (
    <Tarjeta config={CONFIG_REMISION} titulo="Remisión de entrega" fecha={fechaCorta(datos.fecha)} quien={datos.creadoPor} atenuada={anulada}>
      <div className={cn("space-y-1", anulada && "line-through decoration-gray-400")}>
        <p className="text-sm text-gray-800">
          <span className="tabular-nums font-medium">{datos.numero}</span> ·{" "}
          <span className="tabular-nums">{formatearKg3(datos.pesoEntregadoKg)} kg</span> entregados de{" "}
          <span className="tabular-nums">{formatearKg3(datos.pesoRecibidoKg)} kg</span>
          <span className="tabular-nums text-gray-600">
            {" "}
            · merma {formatearKg3(datos.mermaTotalKg)} kg ({formatearMermaPct(datos.mermaTotalKg, datos.pesoRecibidoKg)})
          </span>
        </p>
        <p className="text-xs text-gray-600">
          Valor de los servicios <span className="tabular-nums">{formatearCOP(datos.valorServicios)}</span> (referencia)
        </p>
      </div>
      {datos.forzada && !anulada && (
        <p className="flex flex-wrap items-center gap-1 text-xs font-medium text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          Entregado con servicios pendientes
        </p>
      )}
      {anulada && datos.anulacion && (
        <p className="flex flex-wrap items-center gap-1 text-xs font-medium text-red-700">
          <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Anulada</Badge>
          {fechaCorta(datos.anulacion.en.slice(0, 10))}
          {datos.anulacion.por ? ` · ${datos.anulacion.por}` : ""} · {datos.anulacion.motivo}
        </p>
      )}
    </Tarjeta>
  );
}

/**
 * La historia del lote de principio a fin: recepción o compra, cada proceso con sus kilos de entrada y salida, su
 * merma, su valor y quién lo registró, los baches de la tostión desplegables, los movimientos de inventario ligados
 * al lote, la remisión de entrega (también las anuladas) y, si aplica, su anulación. Los procesos anulados se conservan, tachados y con su motivo.
 */
export function LoteTimeline({ eventos, zonaHoraria }: { eventos: EventoLinea[]; zonaHoraria: string }) {
  if (eventos.length === 0) {
    return <p className="py-4 text-center text-sm text-gray-400">Este lote aún no tiene historia registrada.</p>;
  }
  return (
    <ol className="space-y-3" aria-label="Línea de tiempo del lote">
      {eventos.map((e) => {
        switch (e.clase) {
          case "recepcion":
            return <Recepcion key={e.clave} datos={e.datos} />;
          case "proceso":
            return <Proceso key={e.clave} datos={e.datos} numBultosLote={e.numBultosLote} />;
          case "movimiento":
            return <Movimiento key={e.clave} datos={e.datos} />;
          case "remision":
            return <Remision key={e.clave} datos={e.datos} />;
          case "anulacion_lote":
            return (
              <Tarjeta key={e.clave} config={CONFIG_ANULACION} titulo="Lote anulado" fecha={fechaHoraZona(e.datos.en, zonaHoraria)} quien={e.datos.por}>
                <p className="text-sm text-gray-800">{e.datos.motivo}</p>
              </Tarjeta>
            );
        }
      })}
    </ol>
  );
}
