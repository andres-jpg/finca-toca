import { fechaCorta } from "../../lotes/lib/formato";
import type { LineaPanel, PeriodoPanel } from "../types";

// Periodo del panel de gerencia, en la URL (`?periodo=semana`). Funciones puras: «hoy» llega como parámetro (el servidor lo
// calcula con la zona del cliente; aquí nunca se mira el reloj) y las fechas se suman con aritmética de calendario UTC, sin
// pasar por la zona del navegador.

export const PERIODOS: readonly PeriodoPanel[] = ["hoy", "semana", "mes"];
export const LINEAS_PANEL: readonly LineaPanel[] = ["marca_propia", "trilla", "maquila"];
export const PERIODO_POR_DEFECTO: PeriodoPanel = "mes";

const ETIQUETA_PERIODO: Readonly<Record<PeriodoPanel, string>> = { hoy: "Hoy", semana: "Semana", mes: "Mes" };
const ETIQUETA_LINEA: Readonly<Record<LineaPanel, string>> = { marca_propia: "Marca propia", trilla: "Trilla", maquila: "Maquila" };

export const etiquetaPeriodo = (p: PeriodoPanel): string => ETIQUETA_PERIODO[p];
export const etiquetaLinea = (l: LineaPanel): string => ETIQUETA_LINEA[l];

export interface ParamsPanel {
  periodo: PeriodoPanel;
}

type Param = string | string[] | undefined;

/** Lee `periodo`; lo inválido se descarta en silencio (una URL vieja, con `linea` o `desde`, no debe romper el panel). Por defecto: el mes. */
export function parsearParamsPanel(entrada: Record<string, Param>): ParamsPanel {
  const v = entrada.periodo;
  const periodo = (Array.isArray(v) ? v[0] : v)?.trim();
  return { periodo: (PERIODOS as readonly string[]).includes(periodo ?? "") ? (periodo as PeriodoPanel) : PERIODO_POR_DEFECTO };
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

/**
 * Inicio de «todo el histórico» para `costo_libra_panel`: la base admite rangos de hasta 731 días (`cafe.rango_panel`), así que no vale
 * una fecha fija como 2000-01-01 (la función respondía `datos_invalidos` y el panel y el inventario caían en cuanto había una venta).
 * Son 730 días hasta hoy: el costo de lo vendido en los últimos dos años.
 */
export function desdeHistorico(hoy: string): string {
  return sumarDias(hoy, -730);
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

/** Cuántos días tiene el mes de `ymd` (28 a 31). */
export function diasDelMes(ymd: string): number {
  const [a, m] = ymd.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Nombre del mes de `ymd` en minúscula: `2026-03-11` → `marzo`. */
export function nombreMes(ymd: string): string {
  return MESES[Number(ymd.split("-")[1]) - 1] ?? "";
}

export interface RangoPanel {
  desde: string;
  hasta: string;
}

/** Hoy = el día; semana = del lunes a hoy; mes = del día 1 a hoy. */
export function resolverPeriodo(periodo: PeriodoPanel, hoy: string): RangoPanel {
  switch (periodo) {
    case "semana":
      return { desde: lunesDe(hoy), hasta: hoy };
    case "mes":
      return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
    default:
      return { desde: hoy, hasta: hoy };
  }
}

/**
 * El tramo equivalente anterior, para decir «+4,2 % vs. septiembre»: ayer; la semana pasada hasta el mismo día de la semana;
 * el mes pasado hasta el mismo día del mes (o su último día si es más corto). Compara lo mismo con lo mismo: el mes en curso
 * no se mide contra un mes entero.
 */
export function periodoAnterior(periodo: PeriodoPanel, hoy: string): RangoPanel {
  const { desde, hasta } = resolverPeriodo(periodo, hoy);
  if (periodo === "mes") {
    const anterior = sumarDias(desde, -1); // último día del mes pasado
    const primero = `${anterior.slice(0, 7)}-01`;
    const dia = Math.min(Number(hasta.slice(8, 10)), diasDelMes(anterior));
    return { desde: primero, hasta: `${anterior.slice(0, 7)}-${String(dia).padStart(2, "0")}` };
  }
  const dias = diasInclusivos(desde, hasta);
  const atras = periodo === "semana" ? 7 : 1;
  return { desde: sumarDias(desde, -atras), hasta: sumarDias(desde, -atras + dias - 1) };
}

/** Cómo se llama el tramo anterior en la frase de variación: «septiembre», «la semana pasada», «ayer». */
export function etiquetaAnterior(periodo: PeriodoPanel, hoy: string): string {
  if (periodo === "mes") return nombreMes(periodoAnterior("mes", hoy).desde);
  return periodo === "semana" ? "la semana pasada" : "ayer";
}

/** El periodo en palabras: «29/10/2026» o «26/10/2026 – 29/10/2026». */
export function describirPeriodo(desde: string, hasta: string): string {
  return desde === hasta ? fechaCorta(desde) : `${fechaCorta(desde)} – ${fechaCorta(hasta)}`;
}

/** El query string del panel (sin `?`): solo lo que se aparta del valor por defecto. */
export function serializarParamsPanel(params: Partial<ParamsPanel>): string {
  const p = new URLSearchParams();
  if (params.periodo && params.periodo !== PERIODO_POR_DEFECTO) p.set("periodo", params.periodo);
  return p.toString();
}

/** Títulos de sección que dependen del periodo: «Producción del mes», «Producción de la semana», «Producción de hoy». */
export function deLaPeriodo(periodo: PeriodoPanel): string {
  return periodo === "mes" ? "del mes" : periodo === "semana" ? "de la semana" : "de hoy";
}
