import type { EtapaLote } from "./etapas";
import { ORDEN_PROCESO, etiquetaServicio } from "./servicios";
import type { LineaLote, TipoProceso } from "../types";

// Recorrido del lote (A-17): Compra → Tostión · 2 de 3 bultos → Empaque · parcial → Agotado. Puro: lo que la ficha
// ya leyó de `v_lote_etapas`, sin base ni React.

export type EstadoPaso = "completo" | "en_curso" | "pendiente";

export interface PasoRecorrido {
  clave: string;
  etiqueta: string;
  estado: EstadoPaso;
  /** «2 de 3 bultos», «parcial»; `null` si no hay nada que añadir. */
  detalle: string | null;
}

export interface EntradaRecorrido {
  linea: LineaLote;
  estado: string;
  requeridos: readonly TipoProceso[];
  etapas: readonly EtapaLote[];
  /** Marca propia: no queda café verde, ni tostado a granel, ni empacado de este lote. */
  agotado: boolean;
}

export function construirRecorrido({ linea, estado, requeridos, etapas, agotado }: EntradaRecorrido): PasoRecorrido[] {
  const hechas = new Map(etapas.map((e) => [e.tipo, e]));
  const tipos = [...new Set<TipoProceso>([...requeridos, ...etapas.map((e) => e.tipo)])].sort(
    (a, b) => ORDEN_PROCESO[a] - ORDEN_PROCESO[b],
  );
  const pasos: PasoRecorrido[] = [
    { clave: "origen", etiqueta: linea === "servicio" ? "Recepción" : "Compra", estado: "completo", detalle: null },
  ];
  for (const tipo of tipos) {
    const e = hechas.get(tipo);
    if (!e) {
      pasos.push({ clave: tipo, etiqueta: etiquetaServicio(tipo), estado: "pendiente", detalle: null });
    } else if (e.completo) {
      pasos.push({ clave: tipo, etiqueta: etiquetaServicio(tipo), estado: "completo", detalle: null });
    } else {
      pasos.push({
        clave: tipo,
        etiqueta: etiquetaServicio(tipo),
        estado: "en_curso",
        detalle: tipo === "empaque" ? "parcial" : `${e.bultosProcesados} de ${e.bultosTotal} ${e.bultosTotal === 1 ? "bulto" : "bultos"}`,
      });
    }
  }
  if (linea === "servicio") {
    pasos.push({ clave: "final", etiqueta: "Entregado", estado: estado === "entregado" ? "completo" : "pendiente", detalle: null });
  } else {
    pasos.push({ clave: "final", etiqueta: "Agotado", estado: agotado ? "completo" : "pendiente", detalle: null });
  }
  return pasos;
}
