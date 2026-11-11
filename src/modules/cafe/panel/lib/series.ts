import type { FilaProduccion, VentaDiaria } from "../types";

// Serie del gráfico de ingreso diario. Se arma en el servidor a partir de las filas de `cafe.produccion_diaria` y
// `cafe.ventas_diarias`; el cliente (Recharts) solo la pinta. Puro.

export interface PuntoIngreso {
  fecha: string;
  marcaPropia: number;
  servicios: number;
  /** marca propia + servicios: es el número que va sobre la barra apilada. */
  total: number;
}

/** Ingreso diario. Marca propia = ventas vigentes; servicios = valor de los procesos de lotes de servicio. Los días sin ingreso salen en 0. */
export function serieIngresoPorDia(filas: readonly FilaProduccion[], ventas: readonly VentaDiaria[], dias: readonly string[]): PuntoIngreso[] {
  const servicios = new Map<string, number>();
  for (const f of filas) if (f.linea !== "marca_propia") servicios.set(f.fecha, (servicios.get(f.fecha) ?? 0) + f.valor);
  const marca = new Map(ventas.map((v) => [v.fecha, v.total]));
  return dias.map((fecha) => {
    const marcaPropia = marca.get(fecha) ?? 0;
    const s = servicios.get(fecha) ?? 0;
    return { fecha, marcaPropia, servicios: s, total: marcaPropia + s };
  });
}
