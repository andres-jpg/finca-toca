import { esFechaYmd } from "../../lotes/lib/filtros";
import { fechaCorta } from "../../lotes/lib/formato";
import type { LineaPanel, PeriodoPanel } from "../types";

// Periodo y línea del panel de gerencia, en la URL (`?periodo=semana&linea=maquila` o `?periodo=rango&desde=…&hasta=…`).
// Funciones puras: «hoy» llega como parámetro (el servidor lo calcula con la zona del cliente; aquí nunca se mira el reloj)
// y las fechas se suman con aritmética de calendario UTC, sin pasar por la zona del navegador.

export const PERIODOS: readonly PeriodoPanel[] = ["hoy", "semana", "mes", "rango"];
export const LINEAS_PANEL: readonly LineaPanel[] = ["marca_propia", "trilla", "maquila"];

/** Un rango de más de un año no se pinta (la serie diaria sería ilegible); la base admite hasta dos. */
export const MAX_DIAS_RANGO = 366;

const ETIQUETA_PERIODO: Readonly<Record<PeriodoPanel, string>> = { hoy: "Hoy", semana: "Esta semana", mes: "Este mes", rango: "Rango" };
const ETIQUETA_LINEA: Readonly<Record<LineaPanel, string>> = { marca_propia: "Marca propia", trilla: "Trilla", maquila: "Maquila" };

export const etiquetaPeriodo = (p: PeriodoPanel): string => ETIQUETA_PERIODO[p];
/** `null` = todas las líneas. */
export const etiquetaLinea = (l: LineaPanel | null): string => (l ? ETIQUETA_LINEA[l] : "Todo");

export interface ParamsPanel {
  periodo: PeriodoPanel;
  linea: LineaPanel | null;
  /** Solo con `periodo = rango`. */
  desde?: string;
  hasta?: string;
}

type Param = string | string[] | undefined;

function primero(entrada: Record<string, Param>, clave: string): string | undefined {
  const v = entrada[clave];
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() ? s.trim() : undefined;
}

/** Lee `periodo`, `linea`, `desde` y `hasta`; lo inválido se descarta en silencio (una URL vieja no debe romper el panel). Por defecto: hoy, todo. */
export function parsearParamsPanel(entrada: Record<string, Param>): ParamsPanel {
  const periodo = primero(entrada, "periodo");
  const linea = primero(entrada, "linea");
  const d = primero(entrada, "desde");
  const h = primero(entrada, "hasta");
  const desde = d && esFechaYmd(d) ? d : undefined;
  const hasta = h && esFechaYmd(h) ? h : undefined;
  const rango = (PERIODOS as readonly string[]).includes(periodo ?? "") ? (periodo as PeriodoPanel) : desde || hasta ? "rango" : "hoy";
  return {
    periodo: rango,
    linea: (LINEAS_PANEL as readonly string[]).includes(linea ?? "") ? (linea as LineaPanel) : null,
    ...(desde ? { desde } : {}),
    ...(hasta ? { hasta } : {}),
  };
}

const UN_DIA = 86_400_000;
const aMs = (ymd: string): number => {
  const [a, m, d] = ymd.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
};
const aYmd = (ms: number): string => {
  const f = new Date(ms);
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, "0")}-${String(f.getUTCDate()).padStart(2, "0")}`;
};

/** `ymd` más `n` días (negativo para restar). */
export function sumarDias(ymd: string, n: number): string {
  return aYmd(aMs(ymd) + n * UN_DIA);
}

/** Días entre dos fechas, contando ambas (`2026-03-09`→`2026-03-09` = 1). */
export function diasInclusivos(desde: string, hasta: string): number {
  return Math.round((aMs(hasta) - aMs(desde)) / UN_DIA) + 1;
}

/** Lunes de la semana de `ymd` (la semana empieza en lunes). */
export function lunesDe(ymd: string): string {
  const dia = new Date(aMs(ymd)).getUTCDay(); // 0 = domingo
  return sumarDias(ymd, -((dia + 6) % 7));
}

/** Todos los días del rango, en orden. */
export function listarDias(desde: string, hasta: string): string[] {
  return Array.from({ length: Math.max(0, diasInclusivos(desde, hasta)) }, (_, i) => sumarDias(desde, i));
}

export interface PeriodoResuelto {
  periodo: PeriodoPanel;
  desde: string;
  hasta: string;
  /** Se ajustó algo de lo que pidió el usuario (rango demasiado largo): se le dice. */
  aviso: string | null;
}

/**
 * Convierte el periodo elegido en fechas. Hoy = el día; semana = del lunes a hoy; mes = del día 1 a hoy; rango = lo que
 * escribió (con una sola fecha, ese día hasta hoy o ese día; `desde > hasta` se intercambian; más de un año se recorta).
 */
export function resolverPeriodo(params: Pick<ParamsPanel, "periodo" | "desde" | "hasta">, hoy: string): PeriodoResuelto {
  switch (params.periodo) {
    case "semana":
      return { periodo: "semana", desde: lunesDe(hoy), hasta: hoy, aviso: null };
    case "mes":
      return { periodo: "mes", desde: `${hoy.slice(0, 7)}-01`, hasta: hoy, aviso: null };
    case "rango": {
      let desde = params.desde ?? params.hasta ?? hoy;
      let hasta = params.hasta ?? (params.desde && params.desde > hoy ? params.desde : hoy);
      if (desde > hasta) [desde, hasta] = [hasta, desde];
      let aviso: string | null = null;
      if (diasInclusivos(desde, hasta) > MAX_DIAS_RANGO) {
        desde = sumarDias(hasta, -(MAX_DIAS_RANGO - 1));
        aviso = `El rango máximo es de un año: se muestra desde el ${fechaCorta(desde)}.`;
      }
      return { periodo: "rango", desde, hasta, aviso };
    }
    default:
      return { periodo: "hoy", desde: hoy, hasta: hoy, aviso: null };
  }
}

/** El periodo en palabras: «29/10/2026» o «26/10/2026 – 29/10/2026». */
export function describirPeriodo(desde: string, hasta: string): string {
  return desde === hasta ? fechaCorta(desde) : `${fechaCorta(desde)} – ${fechaCorta(hasta)}`;
}

/** El query string del panel (sin `?`): solo lo que se aparta del valor por defecto, en orden fijo. */
export function serializarParamsPanel(params: Partial<ParamsPanel>): string {
  const p = new URLSearchParams();
  if (params.periodo && params.periodo !== "hoy") p.set("periodo", params.periodo);
  if (params.linea) p.set("linea", params.linea);
  if (params.periodo === "rango") {
    if (params.desde) p.set("desde", params.desde);
    if (params.hasta) p.set("hasta", params.hasta);
  }
  return p.toString();
}
