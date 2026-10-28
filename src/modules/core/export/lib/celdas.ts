// Funciones puras que convierten un valor de la fila en lo que se escribe en la celda de Excel.
// Sin ExcelJS ni servidor: se prueban con valores fijos.

export type FormatoColumna = "texto" | "entero" | "decimal" | "peso" | "moneda" | "porcentaje" | "fecha" | "fechaHora";

/** Zona horaria por defecto si el cliente no la trae (todos los clientes de hoy son colombianos). */
export const ZONA_POR_DEFECTO = "America/Bogota";

/**
 * Formatos numéricos de Excel. `porcentaje` espera la **fracción** (0,15 → 15,0 %), como Excel;
 * `peso` es kilos con tres decimales; `moneda` es COP sin decimales.
 */
export const NUM_FMT: Record<FormatoColumna, string | undefined> = {
  texto: undefined,
  entero: "#,##0",
  decimal: "#,##0.00",
  peso: "#,##0.000",
  moneda: '"$"#,##0',
  porcentaje: "0.0%",
  fecha: "dd/mm/yyyy",
  fechaHora: "dd/mm/yyyy hh:mm",
};

const ANCHO_POR_FORMATO: Record<FormatoColumna, number> = {
  texto: 24,
  entero: 12,
  decimal: 14,
  peso: 14,
  moneda: 16,
  porcentaje: 12,
  fecha: 13,
  fechaHora: 18,
};

export const anchoPorDefecto = (formato: FormatoColumna): number => ANCHO_POR_FORMATO[formato];

/** Formatos que admiten fila de totales (`SUM`). */
export const FORMATOS_SUMABLES: readonly FormatoColumna[] = ["entero", "decimal", "peso", "moneda", "porcentaje"];

const SOLO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Excel no tiene zonas horarias: guarda un número de serie y muestra lo que dice. Para que la celda
 * enseñe la hora de pared del cliente, se escribe como `Date` en UTC con esos mismos componentes.
 */
function horaDePared(instante: Date, zona: string): Date {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instante);
  const p = (tipo: string) => Number(partes.find((x) => x.type === tipo)?.value);
  return new Date(Date.UTC(p("year"), p("month") - 1, p("day"), p("hour"), p("minute"), p("second")));
}

/**
 * Valor de una celda de fecha. Un `YYYY-MM-DD` (columna `date` de Postgres) es un día de calendario sin
 * zona: se respeta tal cual (nada de pasarlo por `new Date()`, que lo movería un día en UTC-5). Un instante
 * (`Date` o ISO con hora, `timestamptz`) se lleva a la hora de pared de `zona`; con `soloFecha` se descarta
 * la hora. Devuelve `null` si no es una fecha válida.
 */
export function aFechaExcel(valor: unknown, zona: string, soloFecha: boolean): Date | null {
  if (valor === null || valor === undefined || valor === "") return null;

  if (typeof valor === "string") {
    const dia = SOLO_FECHA.exec(valor);
    if (dia) return new Date(Date.UTC(Number(dia[1]), Number(dia[2]) - 1, Number(dia[3])));
  }

  const instante = valor instanceof Date ? valor : typeof valor === "string" || typeof valor === "number" ? new Date(valor) : null;
  if (!instante || Number.isNaN(instante.getTime())) return null;

  const pared = horaDePared(instante, zona);
  if (!soloFecha) return pared;
  return new Date(Date.UTC(pared.getUTCFullYear(), pared.getUTCMonth(), pared.getUTCDate()));
}

/** Número de una celda: acepta los `numeric` de Postgres que llegan como texto. `null` si no es finito. */
export function aNumeroExcel(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = typeof valor === "number" ? valor : typeof valor === "string" ? Number(valor.replace(",", ".")) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

export type ValorCelda = string | number | Date | null;

/** Lo que se escribe en la celda para `valor` según el formato de su columna. */
export function valorCelda(valor: unknown, formato: FormatoColumna, zona: string): ValorCelda {
  switch (formato) {
    case "texto":
      if (valor === null || valor === undefined) return null;
      if (typeof valor === "boolean") return valor ? "Sí" : "No";
      return String(valor);
    case "fecha":
      return aFechaExcel(valor, zona, true);
    case "fechaHora":
      return aFechaExcel(valor, zona, false);
    default:
      return aNumeroExcel(valor);
  }
}

/**
 * Nombre de hoja válido para Excel: máximo 31 caracteres, sin `\ / ? * [ ] :`, ni vacío ni con
 * apóstrofe al borde, y único (sin distinguir mayúsculas) respecto a `usados`.
 */
export function nombreHojaValido(nombre: string, usados: ReadonlySet<string>): string {
  let base = nombre.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim().replace(/^'+|'+$/g, "");
  if (!base) base = "Hoja";
  base = base.slice(0, 31).trim();

  const minusculas = new Set([...usados].map((u) => u.toLowerCase()));
  if (!minusculas.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) {
    const sufijo = ` (${i})`;
    const candidato = `${base.slice(0, 31 - sufijo.length).trim()}${sufijo}`;
    if (!minusculas.has(candidato.toLowerCase())) return candidato;
  }
}
