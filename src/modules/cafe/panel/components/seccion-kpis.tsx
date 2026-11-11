import { formatCOP, formatPct } from "@/modules/core/formato/numeros";
import { cn } from "@/lib/utils";
import { DEFINICIONES, gramosVendidosCsv, ingresosDelTramo, librasVsPromedio, margenBruto, variacionPct } from "../lib/kpis";
import { enteroTexto, librasTexto, variacionTexto } from "../lib/formato";
import { deLaPeriodo, etiquetaAnterior, periodoAnterior, type RangoPanel } from "../lib/periodo";
import { getCostosLibra, getProduccionDiaria, getPromedioVentasLbMes, getVentasDiarias, getVentasPresentacion } from "../queries/panel.queries";
import type { PeriodoPanel } from "../types";
import { Cifra, Detalle, TarjetaKpi } from "./tarjeta-kpi";

interface Props {
  periodo: PeriodoPanel;
  desde: string;
  hasta: string;
  hoy: string;
  /** Desde dónde se piden las series diarias: lo que cubra el tramo anterior y los 14 días del gráfico. */
  desdeSerie: string;
}

/**
 * Los tres KPIs del dueño: ingresos (marca propia + servicios, frente al tramo anterior), libras vendidas (frente al promedio
 * mensual, que no es una meta) y margen bruto de marca propia (ventas menos el costo directo de lo vendido). Ninguno de
 * inventario ni por cobrar: Cofradía no maneja estado de pago y el inventario vive en su pantalla.
 */
export async function SeccionKpis({ periodo, desde, hasta, hoy, desdeSerie }: Props) {
  const anterior: RangoPanel = periodoAnterior(periodo, hoy);
  const [ventasDia, filas, ventasPres, promedio] = await Promise.all([
    getVentasDiarias(desdeSerie, hoy),
    getProduccionDiaria(desdeSerie, hoy),
    getVentasPresentacion(desde, hasta),
    getPromedioVentasLbMes(),
  ]);
  const costos = await getCostosLibra(hoy, gramosVendidosCsv(ventasPres));

  const actual = ingresosDelTramo(ventasDia, filas, desde, hasta);
  const previo = ingresosDelTramo(ventasDia, filas, anterior.desde, anterior.hasta);
  const variacion = variacionPct(actual.total, previo.total);
  const etiquetaAnt = etiquetaAnterior(periodo, hoy);

  const libras = librasVsPromedio(ventasPres.reduce((s, v) => s + v.libras, 0), promedio, desde, hasta);
  const margen = margenBruto(ventasPres, costos);

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-3" data-testid="panel-kpis">
      <TarjetaKpi titulo={`Ingresos ${deLaPeriodo(periodo)}`} definicion={DEFINICIONES.ingresos.texto}>
        <Cifra>{formatCOP(actual.total)}</Cifra>
        <dl className="space-y-0.5 text-sm text-gray-700">
          <div className="flex justify-between gap-2">
            <dt>Marca propia</dt>
            <dd className="tabular-nums">{formatCOP(actual.marcaPropia)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Servicios a terceros</dt>
            <dd className="tabular-nums">{formatCOP(actual.servicios)}</dd>
          </div>
        </dl>
        {variacion === null ? (
          <Detalle>Sin ingresos {periodo === "mes" ? `en ${etiquetaAnt}` : `${etiquetaAnt === "ayer" ? "ayer" : `en ${etiquetaAnt}`}`} para comparar.</Detalle>
        ) : (
          <p className={cn("text-sm font-medium tabular-nums", variacion < 0 ? "text-red-700" : "text-teal-700")}>
            {variacionTexto(variacion)} vs. {etiquetaAnt}
          </p>
        )}
      </TarjetaKpi>

      <TarjetaKpi titulo="Libras vendidas" definicion={DEFINICIONES.libras.texto}>
        <Cifra>{librasTexto(libras.libras)}</Cifra>
        {libras.pct === null ? (
          <Detalle>Sin promedio mensual configurado.</Detalle>
        ) : (
          <p className="text-sm font-medium tabular-nums text-gray-800">
            {enteroTexto(libras.pct)} % del promedio mensual ({librasTexto(libras.promedioMes)})
          </p>
        )}
        {libras.pct !== null && !libras.mesCompleto && <Detalle>Frente a {librasTexto(libras.promedioPeriodo)}, la parte del promedio que corresponde a estos días.</Detalle>}
        <Detalle>Es una referencia, no una meta.</Detalle>
      </TarjetaKpi>

      <TarjetaKpi titulo="Margen bruto marca propia" definicion={DEFINICIONES.margen.texto}>
        <Cifra>{margen.margenPct === null ? "—" : formatCOP(margen.margen)}</Cifra>
        {margen.margenPct === null ? (
          <Detalle>Sin ventas de marca propia con costo calculable en el periodo.</Detalle>
        ) : (
          <p className="text-sm font-medium tabular-nums text-gray-800">{formatPct(margen.margenPct)} sobre ventas · costo directo</p>
        )}
        {margen.parcial && <Detalle>No incluye {formatCOP(margen.ingresoSinCosto)} vendidos sin costo calculable.</Detalle>}
      </TarjetaKpi>
    </div>
  );
}
