import { listarDias } from "../lib/periodo";
import { serieIngresoPorDia, serieKgPorDia, serieMermaPorDia } from "../lib/series";
import { getProduccionDiaria, getReferenciasMerma, getVentasDiarias } from "../queries/panel.queries";
import type { LineaPanel } from "../types";
import { GraficoIngreso, GraficoMerma, GraficoProduccion } from "./graficos-wrappers";

interface Props {
  desde: string;
  hasta: string;
  linea: LineaPanel | null;
}

/**
 * Los tres gráficos del panel (kg procesados, merma, ingreso), a partir de la serie diaria de la base. Los días sin
 * actividad se rellenan para que el eje sea continuo. Recharts va en wrappers de cliente con `ssr: false`.
 */
export async function SeccionGraficos({ desde, hasta, linea }: Props) {
  const [filas, ventas, referencias] = await Promise.all([
    getProduccionDiaria(desde, hasta, linea),
    getVentasDiarias(desde, hasta, linea),
    getReferenciasMerma(),
  ]);
  const dias = listarDias(desde, hasta);

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <GraficoProduccion datos={serieKgPorDia(filas, dias)} />
      <GraficoMerma datos={serieMermaPorDia(filas, dias)} referencias={referencias} />
      <div className="xl:col-span-2">
        <GraficoIngreso datos={serieIngresoPorDia(filas, ventas, dias)} linea={linea} />
      </div>
    </div>
  );
}
