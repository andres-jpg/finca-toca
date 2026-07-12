// Orden real de visita de itinerarios por ruta (Requerimientos_Lacteo360_julio6, Prioridad 1).
// Cada ruta reparte sus fincas entre varios itinerarios; el reporte debe listar
// primero las fincas del itinerario prioritario, luego el siguiente, etc. — no alfabético.
const RUTA_ITINERARIO_PRIORIDAD: Record<string, number[]> = {
  "Tuaneca": [1, 2, 3],
  "Centro Arriba": [2, 1, 3],
  "Centro Arriba II": [2, 1, 3],
  "Centro Abajo": [2, 1, 3],
  "Chorrera": [3, 1, 2],
  "Planta": [4, 1, 2, 3],
};

type FincaConItinerario = {
  itinerarioId: number | null;
  itinerarioOrden: number;
  rutaOrden: number;
};

function rankItinerario(itinerarioId: number | null, prioridad: number[] | undefined): number {
  if (prioridad && itinerarioId !== null) {
    const idx = prioridad.indexOf(itinerarioId);
    if (idx !== -1) return idx;
  }
  // Sin itinerario asignado, o ruta no listada en RUTA_ITINERARIO_PRIORIDAD: al final.
  return prioridad ? prioridad.length : 0;
}

// Ordena las fincas de una ruta según el orden real de visita de sus itinerarios,
// no alfabéticamente ni por el `orden` de arrastre de rutas_fincas. Dentro de un
// mismo itinerario respeta `itinerarios_fincas.orden`; las fincas sin itinerario
// (o en un itinerario no contemplado para esa ruta) van al final, respetando `rutaOrden`.
export function ordenarFincasPorItinerario<T extends FincaConItinerario>(
  fincas: T[],
  rutaNombre: string,
): T[] {
  const prioridad = RUTA_ITINERARIO_PRIORIDAD[rutaNombre];
  return [...fincas].sort((a, b) => {
    const ra = rankItinerario(a.itinerarioId, prioridad);
    const rb = rankItinerario(b.itinerarioId, prioridad);
    if (ra !== rb) return ra - rb;
    if (a.itinerarioId !== null && a.itinerarioId === b.itinerarioId) {
      return a.itinerarioOrden - b.itinerarioOrden;
    }
    return a.rutaOrden - b.rutaOrden;
  });
}
