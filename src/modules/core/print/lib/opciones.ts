// Parseo de los `searchParams` de una página de impresión y formato de la fecha del pie. Puro.

export const MAX_COPIAS = 5;

/**
 * `?copias=N` → cuántos tiquetes salen en total (el original y N-1 copias del cliente), entre 1 y `MAX_COPIAS`.
 * Un valor ausente o que no es un entero positivo da `defecto`.
 */
export function parsearCopias(valor: string | string[] | undefined | null, defecto = 1): number {
  const crudo = (Array.isArray(valor) ? valor[0] : valor)?.trim();
  if (!crudo || !/^\d+$/.test(crudo)) return defecto;
  const n = Number(crudo);
  return n < 1 ? defecto : Math.min(n, MAX_COPIAS);
}

/**
 * Fecha y hora de impresión en la zona del cliente (`dd/mm/aaaa hh:mm`, 24 h). Se formatea en el servidor y
 * se pasa como texto: la zona del servidor (UTC en Vercel) no es la del navegador.
 */
export function formatearFechaHoraImpresion(instante: Date, zonaHoraria: string): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: zonaHoraria,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instante);
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "";
  return `${p("day")}/${p("month")}/${p("year")} ${p("hour")}:${p("minute")}`;
}
