// Estado del lote tal como lo deriva `cafe.v_lotes.estado` (nunca se guarda). `entregado` lo emite la vista cuando el
// lote de servicio tiene una remisión de entrega no anulada (CO-32); al anularla, el lote vuelve a su estado derivado.

export const ESTADOS_LOTE = ["recibido", "en_proceso", "parcial", "listo", "entregado", "anulado"] as const;
export type EstadoLoteVisible = (typeof ESTADOS_LOTE)[number];

const ETIQUETA: Readonly<Record<EstadoLoteVisible, string>> = {
  recibido: "Recibido",
  en_proceso: "En proceso",
  parcial: "Parcial",
  listo: "Listo",
  entregado: "Entregado",
  anulado: "Anulado",
};

export function esEstadoLote(valor: unknown): valor is EstadoLoteVisible {
  return typeof valor === "string" && (ESTADOS_LOTE as readonly string[]).includes(valor);
}

/** Etiqueta del estado; un valor desconocido (la vista cambió antes que la app) se muestra tal cual en vez de romper. */
export function etiquetaEstado(estado: string | null | undefined): string {
  if (!estado) return "—";
  return esEstadoLote(estado) ? ETIQUETA[estado] : estado;
}

/** Clases de la insignia de cada estado. */
export function colorEstado(estado: string | null | undefined): string {
  switch (estado) {
    case "recibido":
      return "bg-slate-100 text-slate-700 hover:bg-slate-100";
    case "en_proceso":
      return "bg-sky-100 text-sky-800 hover:bg-sky-100";
    case "parcial":
      return "bg-amber-100 text-amber-800 hover:bg-amber-100";
    case "listo":
      return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100";
    case "entregado":
      return "bg-teal-100 text-teal-800 hover:bg-teal-100";
    case "anulado":
      return "bg-red-100 text-red-700 hover:bg-red-100";
    default:
      return "bg-gray-100 text-gray-600 hover:bg-gray-100";
  }
}

/** ¿Al lote aún le falta trabajo en planta? (para ofrecer «Ir a planta»). */
export function lotePendienteDeTrabajo(estado: string | null | undefined): boolean {
  return estado === "recibido" || estado === "en_proceso" || estado === "parcial";
}
