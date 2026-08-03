import { addMonths, differenceInMonths, parseISO } from "date-fns";
import type {
  AnimalSexo,
  EstadoProductivo,
  EstadoReproductivo,
  ResultadoPalpacion,
  TipoEvento,
} from "@/types";

// ===== Constantes del flujo reproductivo/productivo =====
// Fuente: "Diagrama de flujo reproductivo y productivo del ganado en Finca Villa Blanca".

/** Meses desde la inseminación hasta que la vaca debe pasar a secado. */
export const MESES_SECADO = 7;
/** Meses desde la inseminación hasta la fecha probable de parto. */
export const MESES_PARTO = 9;
/** Meses desde el nacimiento hasta pasar de "leche" a "levante 1". */
export const MESES_LEVANTE_1 = 5;
/** Meses adicionales (1,5 años) desde "levante 1" hasta "levante 2". */
export const MESES_LEVANTE_2 = 18;
/** Días desde el nacimiento hasta realizar el topizado. */
export const DIAS_TOPIZADO = 15;
/** Días tras el parto antes de esperar el primer celo (pre-servicio). */
export const DIAS_CELO_POST_PARTO = 50;
/** Duración del ciclo estral: cada cuántos días reprogramar el celo de una vaca vacía. */
export const DIAS_CICLO_CELO = 20;

/** Eventos que registran un servicio y por tanto fijan la fecha base de secado y parto. */
export const TIPOS_EVENTO_SERVICIO = ["inseminacion", "monta"] as const;
/** Eventos que resuelven una confirmación de preñez. */
export const TIPOS_EVENTO_CONFIRMACION = ["palpacion", "confirmacion_prenez"] as const;

/** Eventos que mueven algún eje de estado (ver `estadoDesdeEvento`). */
export const TIPOS_EVENTO_CON_TRANSICION: TipoEvento[] = [
  "inseminacion",
  "monta",
  "palpacion",
  "confirmacion_prenez",
  "parto",
  "secado",
];

/** Eventos que necesita `calcularAlertas` para derivar fechas. */
export const TIPOS_EVENTO_PARA_ALERTAS: TipoEvento[] = [
  "inseminacion",
  "monta",
  "palpacion",
  "confirmacion_prenez",
  "parto",
  "secado",
  "topizado",
  "celo",
];

// ===== Estado productivo =====

export const ESTADOS_PRODUCTIVOS: EstadoProductivo[] = [
  "leche",
  "levante_1",
  "levante_2",
  "produccion",
  "secado",
  "reproductor",
];

export const ESTADO_PRODUCTIVO_LABELS: Record<EstadoProductivo, string> = {
  leche: "Leche",
  levante_1: "Levante 1",
  levante_2: "Levante 2",
  produccion: "Producción",
  secado: "Secado",
  reproductor: "Reproductor",
};

export const ESTADO_PRODUCTIVO_COLORS: Record<EstadoProductivo, string> = {
  leche: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  levante_1: "bg-purple-100 text-purple-700 hover:bg-purple-100",
  levante_2: "bg-orange-100 text-orange-700 hover:bg-orange-100",
  produccion: "bg-green-100 text-green-700 hover:bg-green-100",
  secado: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100",
  reproductor: "bg-sky-100 text-sky-700 hover:bg-sky-100",
};

/** Hex para gráficas y puntos de color del dashboard (no admite clases de Tailwind). */
export const ESTADO_PRODUCTIVO_HEX: Record<EstadoProductivo, string> = {
  leche: "#3b82f6",
  levante_1: "#a855f7",
  levante_2: "#f97316",
  produccion: "#16a34a",
  secado: "#eab308",
  reproductor: "#0284c7",
};

export const ESTADOS_PRODUCTIVOS_POR_SEXO: Record<AnimalSexo, EstadoProductivo[]> = {
  hembra: ["leche", "levante_1", "levante_2", "produccion", "secado"],
  macho: ["leche", "levante_1", "levante_2", "reproductor"],
};

// ===== Estado reproductivo (solo hembras) =====

export const ESTADOS_REPRODUCTIVOS: EstadoReproductivo[] = [
  "vacia",
  "pre_servicio",
  "por_confirmar",
  "rechequeo",
  "cargada",
];

export const ESTADO_REPRODUCTIVO_LABELS: Record<EstadoReproductivo, string> = {
  vacia: "Vacía",
  pre_servicio: "Pre-servicio",
  por_confirmar: "Por confirmar",
  rechequeo: "Rechequeo",
  cargada: "Cargada",
};

export const ESTADO_REPRODUCTIVO_COLORS: Record<EstadoReproductivo, string> = {
  vacia: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  pre_servicio: "bg-teal-100 text-teal-700 hover:bg-teal-100",
  por_confirmar: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  rechequeo: "bg-orange-100 text-orange-700 hover:bg-orange-100",
  cargada: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
};

export const ESTADO_REPRODUCTIVO_HEX: Record<EstadoReproductivo, string> = {
  vacia: "#64748b",
  pre_servicio: "#14b8a6",
  por_confirmar: "#d97706",
  rechequeo: "#f97316",
  cargada: "#059669",
};

// ===== Helpers =====

/**
 * Convierte una fecha `YYYY-MM-DD` de Postgres en un `Date` local.
 * `new Date("2026-01-10")` la interpretaría como UTC y en Colombia (UTC-5) caería
 * un día antes; `parseISO` de date-fns respeta la zona local para fechas sin hora.
 */
export function parseFechaDB(iso: string): Date {
  return parseISO(iso);
}

export function esEstadoProductivoValido(sexo: AnimalSexo, estado: string): boolean {
  return (ESTADOS_PRODUCTIVOS_POR_SEXO[sexo] as string[]).includes(estado);
}

/**
 * Estado productivo que le corresponde a un animal joven según su edad.
 * Solo cubre el tramo de crianza: quien ya está en producción, secado o reproductor
 * no debe pasar por aquí (ver `sincronizarEstadosPorEdad`).
 */
export function estadoProductivoPorEdad(
  fechaNacimiento: string,
  hoy: Date = new Date()
): Extract<EstadoProductivo, "leche" | "levante_1" | "levante_2"> {
  // differenceInMonths cuenta meses *cumplidos*, no cambios de mes en el calendario:
  // una cría nacida el 20/03 cumple 5 meses el 20/08, no el 01/08.
  const meses = differenceInMonths(hoy, parseFechaDB(fechaNacimiento));
  if (meses >= MESES_LEVANTE_1 + MESES_LEVANTE_2) return "levante_2";
  if (meses >= MESES_LEVANTE_1) return "levante_1";
  return "leche";
}

/**
 * Transición de estados que provoca registrar un evento.
 * Devuelve solo los ejes que cambian; `{}` significa "el evento no mueve el estado".
 */
export function estadoDesdeEvento(
  tipoEvento: TipoEvento,
  resultado?: ResultadoPalpacion | null
): { productivo?: EstadoProductivo; reproductivo?: EstadoReproductivo } {
  switch (tipoEvento) {
    case "inseminacion":
    case "monta":
      return { reproductivo: "por_confirmar" };
    case "palpacion":
    case "confirmacion_prenez":
      // Los tres resultados posibles coinciden 1:1 con estados reproductivos.
      return resultado ? { reproductivo: resultado } : {};
    case "parto":
      return { productivo: "produccion", reproductivo: "pre_servicio" };
    case "secado":
      // La vaca sigue cargada: solo deja de dar leche.
      return { productivo: "secado" };
    default:
      return {};
  }
}

/** Proyecciones que se muestran al registrar una inseminación/monta. */
export function proyeccionesServicio(fechaServicio: Date) {
  return {
    secado: addMonths(fechaServicio, MESES_SECADO),
    parto: addMonths(fechaServicio, MESES_PARTO),
  };
}
