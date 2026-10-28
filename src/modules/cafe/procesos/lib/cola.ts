import type { TipoProceso } from "../../lotes/types";
import type { TarjetaLotePlanta } from "../types-planta";

// Filtros de la cola de trabajo de la planta. Puro: la lista llega entera del servidor (son los lotes con
// trabajo pendiente, pocos) y el operario filtra al instante sin ir y volver a la base.

export interface FiltrosCola {
  /** Paso que toca a la tarjeta; `null` = todos. */
  paso: TipoProceso | null;
  /** Texto buscado en el código del lote (y en el nombre del cliente o proveedor). */
  q: string;
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filtrarCola(tarjetas: readonly TarjetaLotePlanta[], filtros: FiltrosCola): TarjetaLotePlanta[] {
  const q = sinTildes(filtros.q.trim());
  return tarjetas.filter((t) => {
    if (filtros.paso && t.siguiente?.tipo !== filtros.paso) return false;
    if (q && !sinTildes(t.codigo).includes(q) && !sinTildes(t.tercero).includes(q)) return false;
    return true;
  });
}

/** Servicios (clientes) y marca propia van SIEMPRE por separado (HU-12 c3): nunca en una misma lista. */
export function separarPorLinea(tarjetas: readonly TarjetaLotePlanta[]): {
  servicios: TarjetaLotePlanta[];
  marcaPropia: TarjetaLotePlanta[];
} {
  return {
    servicios: tarjetas.filter((t) => t.linea === "servicio"),
    marcaPropia: tarjetas.filter((t) => t.linea === "marca_propia"),
  };
}

/** Cuántas tarjetas hay por paso pendiente, para los contadores del filtro. */
export function contarPorPaso(tarjetas: readonly TarjetaLotePlanta[]): Record<TipoProceso, number> {
  const cuenta: Record<TipoProceso, number> = { trilla: 0, tostion: 0, molienda: 0, empaque: 0 };
  for (const t of tarjetas) if (t.siguiente) cuenta[t.siguiente.tipo] += 1;
  return cuenta;
}
