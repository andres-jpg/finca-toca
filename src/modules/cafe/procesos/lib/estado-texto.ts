import type { TipoProceso } from "../../lotes/types";
import type { EstadoMerma } from "./merma";

// Textos del estado de la merma (A-03). Puros: los usan `MermaBadge` y los tests.

export const ETIQUETA_ESTADO_MERMA: Readonly<Record<EstadoMerma, string>> = {
  en_rango: "En rango",
  alta: "Revisar · alta",
  baja: "Verificar · baja",
};

/**
 * Texto auxiliar visible (no depende del hover: en tablet no existe). En tostión son los de la issue; en trilla
 * no tiene sentido hablar de tueste, así que se dice solo lo que se puede afirmar. En rango no lleva texto.
 */
export function ayudaEstadoMerma(estado: EstadoMerma, tipo?: TipoProceso | null): string | null {
  if (estado === "en_rango") return null;
  if (tipo && tipo !== "tostion") return estado === "alta" ? "posible pérdida o error de pesaje" : "verifica el peso registrado";
  return estado === "alta" ? "posible sobretueste o pérdida" : "peso o desarrollo del tueste";
}

/** `desvio_sentido` de la base → estado. `null` en rango NO se distingue de «sin referencia»: usa `estadoMerma`. */
export function estadoDesdeSentido(sentido: string | null | undefined): "alta" | "baja" | null {
  return sentido === "alta" || sentido === "baja" ? sentido : null;
}
