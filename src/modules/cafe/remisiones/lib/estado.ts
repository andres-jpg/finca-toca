import type { RemisionLinea } from "@/modules/cafe/lotes/lib/linea-tiempo";
import type { Remision } from "../types";

// Reglas de pantalla de la remisión (qué botón se ofrece). La frontera real son la RPC y el RLS; esto solo evita
// ofrecer lo que la base va a rechazar. Pura.

/** Lo que la ficha del lote sabe del lote para decidir si ofrece «Generar remisión». */
export interface LoteParaRemision {
  linea: "servicio" | "marca_propia";
  /** `v_lotes.estado`. */
  estado: string | null | undefined;
}

export type OpcionGenerar =
  /** El lote está completo: se genera sin más. */
  | "normal"
  /** Servicios pendientes: solo `owner`/`admin`, con observación. */
  | "forzar"
  | "no";

/**
 * ¿Se ofrece generar la remisión? Solo lotes de servicio con trabajo hecho y sin remisión vigente. `listo` = normal;
 * `en_proceso` / `parcial` = solo un administrador puede forzar. `recibido` (sin procesos), `entregado`, `anulado`
 * y marca propia: no.
 */
export function opcionGenerar(lote: LoteParaRemision, esAdmin: boolean): OpcionGenerar {
  if (lote.linea !== "servicio") return "no";
  if (lote.estado === "listo") return "normal";
  if ((lote.estado === "en_proceso" || lote.estado === "parcial") && esAdmin) return "forzar";
  return "no";
}

/** La remisión vigente es la única no anulada (la base garantiza a lo sumo una por lote). */
export function remisionVigente(remisiones: readonly Remision[]): Remision | null {
  return remisiones.find((r) => r.anulacion === null) ?? null;
}

/** Estado de una remisión para insignias y filtros. */
export type EstadoRemision = "vigente" | "anulada";

export function estadoRemision(r: Pick<Remision, "anulacion">): EstadoRemision {
  return r.anulacion ? "anulada" : "vigente";
}

export function etiquetaEstadoRemision(estado: EstadoRemision): string {
  return estado === "vigente" ? "Vigente" : "Anulada";
}

/** Ruta del tiquete; `copias` = tiquetes en total (2 = original + «COPIA CLIENTE»). */
export function rutaTiquete(id: string, copias = 1): string {
  return copias > 1 ? `/print/remision/${id}?copias=${copias}` : `/print/remision/${id}`;
}

/** La remisión como evento de la línea de tiempo del lote (`usuarios`: id → email, de `getResponsables()`). */
export function aEventoDeLinea(r: Remision, usuarios: ReadonlyMap<string, string>): RemisionLinea {
  const quien = (id: string | null) => (id ? (usuarios.get(id) ?? null) : null);
  return {
    id: r.id,
    numero: r.numero,
    fecha: r.fecha,
    creadoEn: r.creadoEn,
    creadoPor: quien(r.creadoPor),
    pesoRecibidoKg: r.pesoRecibidoKg,
    pesoEntregadoKg: r.pesoEntregadoKg,
    mermaTotalKg: r.mermaTotalKg,
    valorServicios: r.valorServicios,
    forzada: r.forzada,
    anulacion: r.anulacion ? { en: r.anulacion.en, por: quien(r.anulacion.por), motivo: r.anulacion.motivo } : null,
  };
}
