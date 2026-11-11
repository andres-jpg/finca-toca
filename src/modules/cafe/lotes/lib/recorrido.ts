import { formatKg, formatKgNum } from "@/modules/core/formato/numeros";
import type { EtapaLote } from "./etapas";
import { ORDEN_PROCESO, etiquetaServicio } from "./servicios";
import type { LineaLote, TipoProceso } from "../types";

// Recorrido del lote (B-12, modifica A-17): Compra · Trilla · Tostión · Molienda · Empaque · Agotado/Entregado.
//   completo  → ficha oscura («Compra · 320,0 kg · completo»)
//   parcial   → enlace al proceso («Tostión → 118,0 de 320,0 kg · continuar»)
//   pendiente → enlace al proceso: el paso es el que toca y aún no empezó
//   futuro    → gris, sin enlace («Agotado · pendiente»)
// Puro: lo que la ficha ya leyó de `v_lote_etapas`, sin base ni React.

export type EstadoPaso = "completo" | "parcial" | "pendiente" | "futuro";

export interface PasoRecorrido {
  clave: string;
  etiqueta: string;
  estado: EstadoPaso;
  /** Segunda línea de la ficha: «118,0 de 320,0 kg · continuar», «pendiente»… */
  detalle: string;
  /** Planta en ese paso; `null` si el paso no se puede abrir (completo, futuro o sin permiso para operar). */
  href: string | null;
}

export interface EntradaRecorrido {
  loteId: string;
  linea: LineaLote;
  estado: string;
  requeridos: readonly TipoProceso[];
  etapas: readonly EtapaLote[];
  pesoRecibidoKg: number;
  /** Tostado que aún no está en bolsas (saldo de tostión por empacar + tostado sin empacar), en kg. */
  tostadoPorEmpacarKg: number;
  /** Marca propia: no queda café verde, ni tostado a granel, ni empacado de este lote. */
  agotado: boolean;
  /** Quien puede registrar procesos (no es Gerencia y el módulo de planta está activo): sin esto no hay enlaces. */
  puedeOperar: boolean;
}

/** Planta del lote con el paso preseleccionado (la página de planta lee `?paso=`). */
export function rutaPlantaPaso(loteId: string, tipo: TipoProceso): string {
  return `/dashboard/cafe/planta/${loteId}?paso=${tipo}`;
}

const TOLERANCIA_KG = 0.05;

const VERBO_POR: Record<TipoProceso, string> = { trilla: "trillar", tostion: "tostar", molienda: "moler", empaque: "empacar" };

function detalleCompleto(e: EtapaLote): string {
  const kg = formatKg(e.pesoSalidaKg ?? e.pesoEntradaKg);
  if (e.tipo === "molienda") return `${kg} · realizada`;
  if (e.tipo === "empaque") return "completo";
  return `${kg} · completo`;
}

export function construirRecorrido(e: EntradaRecorrido): PasoRecorrido[] {
  const hechas = new Map(e.etapas.map((x) => [x.tipo, x]));
  const tipos = [...new Set<TipoProceso>([...e.requeridos, ...e.etapas.map((x) => x.tipo)])].sort(
    (a, b) => ORDEN_PROCESO[a] - ORDEN_PROCESO[b],
  );
  const enlace = (tipo: TipoProceso) => (e.puedeOperar ? rutaPlantaPaso(e.loteId, tipo) : null);

  const pasos: PasoRecorrido[] = [
    {
      clave: "origen",
      etiqueta: e.linea === "servicio" ? "Recepción" : "Compra",
      estado: "completo",
      detalle: `${formatKg(e.pesoRecibidoKg)} · ${e.linea === "servicio" ? "recibido" : "completo"}`,
      href: null,
    },
  ];

  // Un paso sin empezar es «pendiente» (enlace) solo si todo lo anterior ya está en marcha o hecho; si no, es futuro.
  let anteriorEnMarcha = true;
  for (const tipo of tipos) {
    const etapa = hechas.get(tipo);
    const etiqueta = etiquetaServicio(tipo);
    const porEmpacar = tipo === "empaque" && e.tostadoPorEmpacarKg > TOLERANCIA_KG;

    if (etapa && etapa.completo && !porEmpacar) {
      pasos.push({ clave: tipo, etiqueta, estado: "completo", detalle: detalleCompleto(etapa), href: null });
    } else if (etapa) {
      const detalle =
        tipo === "empaque"
          ? porEmpacar
            ? `${formatKg(e.tostadoPorEmpacarKg)} tostado por empacar`
            : `${formatKg(etapa.kgPendientes)} por empacar`
          : tipo === "molienda"
            ? `${formatKg(etapa.kgPendientes)} por ${VERBO_POR[tipo]} · continuar`
            : `${formatKgNum(etapa.kgProcesados)} de ${formatKg(etapa.kgBase)} · continuar`;
      pasos.push({ clave: tipo, etiqueta, estado: "parcial", detalle, href: enlace(tipo) });
    } else if (anteriorEnMarcha) {
      pasos.push({ clave: tipo, etiqueta, estado: "pendiente", detalle: "pendiente · iniciar", href: enlace(tipo) });
    } else {
      pasos.push({ clave: tipo, etiqueta, estado: "futuro", detalle: "pendiente", href: null });
    }
    anteriorEnMarcha = Boolean(etapa);
  }

  if (e.linea === "servicio") {
    const entregado = e.estado === "entregado";
    pasos.push({ clave: "final", etiqueta: "Entregado", estado: entregado ? "completo" : "futuro", detalle: entregado ? "entregado" : "pendiente", href: null });
  } else {
    pasos.push({ clave: "final", etiqueta: "Agotado", estado: e.agotado ? "completo" : "futuro", detalle: e.agotado ? "agotado" : "pendiente", href: null });
  }
  return pasos;
}
