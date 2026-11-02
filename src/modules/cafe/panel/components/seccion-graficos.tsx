import { listarDias } from "../lib/periodo";
import { serieIngresoPorDia, serieKgPorDia, serieMermaPorDia, serieMermaTostion } from "../lib/series";
import { getProduccionDiaria, getReferenciasMerma, getReferenciasPanel, getVentasDiarias } from "../queries/panel.queries";
import type { LineaPanel } from "../types";
import { GraficoIngreso, GraficoMerma, GraficoMermaTostion, GraficoProduccion } from "./graficos-wrappers";

interface Props {
  desde: string;
  hasta: string;
  linea: LineaPanel | null;
}

/**
 * Los gráficos del panel (kg procesados, merma, merma de tostión con su banda de referencia, ingreso), a partir de la serie diaria de la base. Los días sin
 * actividad se rellenan para que el eje sea continuo. Recharts va en wrappers de cliente con `ssr: false`.
 */
export async function SeccionGraficos({ desde, hasta, linea }: Props) {
  const [filas, ventas, referencias, refsBanda] = await Promise.all([
    getProduccionDiaria(desde, hasta, linea),
    getVentasDiarias(desde, hasta, linea),
    getReferenciasMerma(),
    getReferenciasPanel(),
  ]);
  const dias = listarDias(desde, hasta);

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <GraficoProduccion datos={serieKgPorDia(filas, dias)} />
      <GraficoMerma datos={serieMermaPorDia(filas, dias)} referencias={referencias} />
      <div className="xl:col-span-2">
        <GraficoMermaTostion datos={serieMermaTostion(filas, dias, refsBanda.tostion, refsBanda.toleranciaPts)} referenciaPct={refsBanda.tostion} toleranciaPts={refsBanda.toleranciaPts} />
      </div>
      <div className="xl:col-span-2">
        <GraficoIngreso datos={serieIngresoPorDia(filas, ventas, dias)} linea={linea} />
      </div>
    </div>
  );
}
