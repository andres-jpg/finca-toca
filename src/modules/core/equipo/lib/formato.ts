/**
 * Fecha y hora de un instante en la zona horaria del cliente (`tenants.zona_horaria`). Se formatea en el
 * servidor con zona explícita: el servidor está en UTC y el navegador en la hora local de cada quien.
 */
export function formatearAcceso(iso: string, zonaHoraria: string): string {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: zonaHoraria }).format(
    new Date(iso),
  );
}
