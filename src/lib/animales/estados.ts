import {
  addMonths,
  differenceInCalendarDays,
  differenceInMonths,
  parseISO,
} from "date-fns";
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
/**
 * Período de espera voluntario: días tras cerrarse la gestación (parto o aborto) durante
 * los que la vaca no se sirve. Gobierna dos cosas a la vez, y por eso es una sola constante:
 * la fecha objetivo de la alerta de celo y el pase automático `pre_servicio` → `servicio`
 * que hace el cron diario (`sincronizarPaseAServicio`).
 */
export const DIAS_CELO_POST_PARTO = 60;
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
  "aborto",
  "secado",
];

/** Eventos que cierran una gestación y devuelven la vaca a pre-servicio. */
export const TIPOS_EVENTO_FIN_GESTACION: TipoEvento[] = ["parto", "aborto"];

/** Eventos que necesita `calcularAlertas` para derivar fechas. */
export const TIPOS_EVENTO_PARA_ALERTAS: TipoEvento[] = [
  "inseminacion",
  "monta",
  "palpacion",
  "confirmacion_prenez",
  "parto",
  "aborto",
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
  "pre_puber",
  "puber",
  "vacia",
  "pre_servicio",
  "servicio",
  "por_confirmar",
  "rechequeo",
  "cargada",
];

export const ESTADO_REPRODUCTIVO_LABELS: Record<EstadoReproductivo, string> = {
  pre_puber: "Pre-púber",
  puber: "Púber",
  vacia: "Vacía",
  pre_servicio: "Pre-servicio",
  servicio: "Servicio",
  por_confirmar: "Por confirmar",
  rechequeo: "Rechequeo",
  cargada: "Cargada",
};

export const ESTADO_REPRODUCTIVO_COLORS: Record<EstadoReproductivo, string> = {
  pre_puber: "bg-sky-100 text-sky-700 hover:bg-sky-100",
  puber: "bg-indigo-100 text-indigo-700 hover:bg-indigo-100",
  vacia: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  pre_servicio: "bg-teal-100 text-teal-700 hover:bg-teal-100",
  servicio: "bg-cyan-100 text-cyan-700 hover:bg-cyan-100",
  por_confirmar: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  rechequeo: "bg-orange-100 text-orange-700 hover:bg-orange-100",
  cargada: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
};

export const ESTADO_REPRODUCTIVO_HEX: Record<EstadoReproductivo, string> = {
  pre_puber: "#0ea5e9",
  puber: "#6366f1",
  vacia: "#64748b",
  pre_servicio: "#14b8a6",
  servicio: "#0891b2",
  por_confirmar: "#d97706",
  rechequeo: "#f97316",
  cargada: "#059669",
};

/**
 * Escalera reproductiva de la novilla, la única que gobierna el estado productivo
 * (y por tanto la edad) en lugar de los eventos: `leche` → pre-púber,
 * `levante_1` → púber, `levante_2` → servicio, ya apta para inseminar.
 *
 * Se aplica **solo hacia adelante y solo dentro de la escalera**: en cuanto un evento
 * mueve a la vaca fuera de ella (`por_confirmar`, `cargada`, `pre_servicio`…) deja de
 * gobernar, para no revertir a "servicio" una novilla que ya fue inseminada en levante 2.
 */
export const ORDEN_REPRODUCTIVO_JUVENIL: EstadoReproductivo[] = [
  "pre_puber",
  "puber",
  "servicio",
];

/** Estado reproductivo que le corresponde a una hembra por su tramo de crianza. */
export function estadoReproductivoPorCrianza(
  productivo: EstadoProductivo | null
): EstadoReproductivo | null {
  switch (productivo) {
    case "leche":
      return "pre_puber";
    case "levante_1":
      return "puber";
    case "levante_2":
      return "servicio";
    default:
      return null;
  }
}

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

const plural = (n: number, singular: string, plural: string) =>
  `${n} ${n === 1 ? singular : plural}`;

/**
 * Edad del animal en texto, con la precisión que interesa en cada tramo: días mientras es
 * una cría recién nacida, meses durante todo el levante (los estados productivos se miden
 * en meses) y años + meses a partir de los dos años.
 *
 * Devuelve `null` si no hay fecha de nacimiento — pasa con animales de origen externo, de
 * los que a veces solo se conoce la fecha de compra.
 *
 * Cuenta meses y años **cumplidos** (`differenceInMonths`), igual que
 * `estadoProductivoPorEdad()`: una cría nacida el 20/03 cumple 5 meses el 20/08, no el 01/08.
 *
 * Debe llamarse desde el servidor y pasarse ya formateada al cliente: `parseFechaDB` resuelve
 * la fecha en la zona horaria local, que en Vercel es UTC y en el navegador del ganadero
 * UTC-5, y calcularla en ambos lados daría un desajuste de hidratación.
 */
export function formatEdad(
  fechaNacimiento: string | null,
  hoy: Date = new Date()
): string | null {
  if (!fechaNacimiento) return null;

  const nacimiento = parseFechaDB(fechaNacimiento);
  const meses = differenceInMonths(hoy, nacimiento);

  if (meses < 1) {
    const dias = Math.max(0, differenceInCalendarDays(hoy, nacimiento));
    return plural(dias, "día", "días");
  }

  if (meses < 24) return plural(meses, "mes", "meses");

  const anios = Math.floor(meses / 12);
  const restoMeses = meses % 12;
  const texto = plural(anios, "año", "años");

  return restoMeses === 0 ? texto : `${texto} y ${plural(restoMeses, "mes", "meses")}`;
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
    // El aborto cierra la gestación igual que un parto: la vaca vuelve a ordeño y
    // reinicia el ciclo reproductivo desde pre-servicio.
    case "aborto":
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
