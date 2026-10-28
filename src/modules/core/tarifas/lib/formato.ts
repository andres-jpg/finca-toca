/** Pesos colombianos: sin decimales salvo que la tarifa los tenga (`1.400`, `1.250,50`). */
export function formatearPesos(valor: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(valor);
}

/**
 * Fecha y hora de una vigencia en la zona horaria del cliente (`tenants.zona_horaria`). Se formatea en el
 * servidor y se pasa ya como texto: en un componente de cliente la zona del servidor (UTC en Vercel) y la
 * del navegador darían textos distintos y la hidratación fallaría.
 */
export function formatearVigencia(iso: string, zonaHoraria: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: zonaHoraria,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}
