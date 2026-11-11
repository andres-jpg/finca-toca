import { ingresosDelTramo } from "../lib/kpis";
import { listarDias, sumarDias } from "../lib/periodo";
import { serieIngresoPorDia } from "../lib/series";
import { getProduccionDiaria, getVentasDiarias } from "../queries/panel.queries";
import type { PeriodoPanel } from "../types";
import { GraficoIngreso } from "./graficos-wrappers";

interface Props {
  periodo: PeriodoPanel;
  desde: string;
  hasta: string;
  hoy: string;
  desdeSerie: string;
}

const ACUMULADO: Readonly<Record<PeriodoPanel, string>> = { hoy: "Acumulado de hoy", semana: "Acumulado de la semana", mes: "Acumulado del mes" };

/** Ingresos de los últimos 14 días, apilados marca propia / servicios; el acumulado del periodo elegido va en el encabezado. */
export async function SeccionIngresos({ periodo, desde, hasta, hoy, desdeSerie }: Props) {
  const [ventas, filas] = await Promise.all([getVentasDiarias(desdeSerie, hoy), getProduccionDiaria(desdeSerie, hoy)]);
  const serie = serieIngresoPorDia(filas, ventas, listarDias(sumarDias(hoy, -13), hoy));
  const acumulado = ingresosDelTramo(ventas, filas, desde, hasta).total;
  return <GraficoIngreso datos={serie} acumulado={acumulado} etiquetaAcumulado={ACUMULADO[periodo]} />;
}
