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
 * los que la vaca no se sirve. Es la **fecha objetivo de la alerta de celo**: el día 60 la
 * alerta marca "hoy" y a partir del 61 queda "vencida".
 */
export const DIAS_CELO_POST_PARTO = 60;
/**
 * Días tras el parto/aborto en que el cron pasa la vaca de `pre_servicio` a `servicio`.
 *
 * Es **uno más** que `DIAS_CELO_POST_PARTO` a propósito: así el día objetivo de la alerta
 * (el 60) la vaca todavía se ve en `pre_servicio`, y el pase ocurre al día siguiente, justo
 * cuando la alerta de celo vence. Antes ambas cosas compartían constante y la vaca ya
 * aparecía en `servicio` el mismo día en que la alerta pedía observar el celo.
 *
 * La alerta de celo sigue cubriendo `pre_servicio` **y** `servicio` (ver `calcularAlertas`):
 * el pase no debe apagarla, solo se resuelve al registrar el celo o el servicio.
 */
export const DIAS_PASE_A_SERVICIO = DIAS_CELO_POST_PARTO + 1;
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
  "pre_servicio",
  "servicio",
  "por_confirmar",
  "rechequeo",
  "cargada",
];

export const ESTADO_REPRODUCTIVO_LABELS: Record<EstadoReproductivo, string> = {
  pre_puber: "Pre-púber",
  puber: "Púber",
  pre_servicio: "Pre-servicio",
  servicio: "Servicio",
  por_confirmar: "Por confirmar",
  rechequeo: "Rechequeo",
  cargada: "Cargada",
};

export const ESTADO_REPRODUCTIVO_COLORS: Record<EstadoReproductivo, string> = {
  pre_puber: "bg-sky-100 text-sky-700 hover:bg-sky-100",
  puber: "bg-indigo-100 text-indigo-700 hover:bg-indigo-100",
  pre_servicio: "bg-teal-100 text-teal-700 hover:bg-teal-100",
  servicio: "bg-cyan-100 text-cyan-700 hover:bg-cyan-100",
  por_confirmar: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  rechequeo: "bg-orange-100 text-orange-700 hover:bg-orange-100",
  cargada: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
};

export const ESTADO_REPRODUCTIVO_HEX: Record<EstadoReproductivo, string> = {
  pre_puber: "#0ea5e9",
  puber: "#6366f1",
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

/** Lo mínimo que necesita `calcularDiasEnLeche` de cada evento. */
export interface EventoParaDiasEnLeche {
  tipo_evento: TipoEvento;
  fecha: string;
}

/**
 * Días en leche (DEL): días transcurridos desde que arrancó la lactancia actual.
 *
 * La lactancia **arranca** con un `parto` o un `aborto` (ambos devuelven la vaca a ordeño) y
 * **se cierra** con un `secado`, que pone el contador a 0 hasta el siguiente parto/aborto.
 * Por eso solo miran estos tres tipos de evento: gana el más reciente.
 *
 * Se cuenta desde `eventos_animal.fecha`, nunca desde `created_at` ni desde la fecha en que
 * se cambió el estado — mismo criterio que las alertas de secado y parto: el ganadero puede
 * registrar el parto con retraso y la fecha real solo está en el evento.
 *
 * Devuelve `null` si no hay ningún evento de estos: sin fecha base no se inventa un número
 * (igual que `faltaRegistrarServicio` en las alertas).
 *
 * Debe llamarse desde el servidor y pasarse ya calculado al cliente, como `formatEdad()`:
 * `parseFechaDB` resuelve en la zona local, que en Vercel es UTC y en el navegador UTC-5.
 */
export function calcularDiasEnLeche(
  estadoProductivo: EstadoProductivo | null,
  eventos: EventoParaDiasEnLeche[],
  hoy: Date = new Date()
): number | null {
  // Una vaca en secado no está en leche aunque no se haya registrado el evento de secado
  // (el estado se puede haber puesto a mano). El estado manda sobre el historial aquí.
  if (estadoProductivo === "secado") return 0;

  const relevantes = eventos.filter(
    (e) => e.tipo_evento === "secado" || TIPOS_EVENTO_FIN_GESTACION.includes(e.tipo_evento)
  );
  if (relevantes.length === 0) return null;

  // Orden determinista: por fecha y, a igualdad de fecha, el secado se considera posterior
  // (una vaca secada el mismo día que se registra el parto queda seca, no en leche).
  const ordenados = [...relevantes].sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
    return Number(a.tipo_evento === "secado") - Number(b.tipo_evento === "secado");
  });

  const ultimo = ordenados[ordenados.length - 1];
  if (ultimo.tipo_evento === "secado") return 0;

  // Sin negativos: un parto con fecha futura (dedazo al teclear) cuenta como 0, no como -N.
  return Math.max(0, differenceInCalendarDays(hoy, parseFechaDB(ultimo.fecha)));
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
      // "cargada" y "rechequeo" coinciden 1:1 con el estado reproductivo. "vacía" no es un
      // estado propio — la vaca vuelve directo al pool de servicio en vez de quedar en un
      // estado de espera aparte.
      if (!resultado) return {};
      return { reproductivo: resultado === "vacia" ? "servicio" : resultado };
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
