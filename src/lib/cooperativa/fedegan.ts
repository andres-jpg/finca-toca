import { FEDEGAN_PCT } from "./recolecciones";

// Requerimientos_Lacteo360_julio6 — Prioridad 2: estas rutas no tienen descuento Fedegan.
const RUTAS_SIN_DESCUENTO_FEDEGAN = new Set([
  "Centro Arriba",
  "Centro Arriba II",
  "Tuaneca",
]);

export function getFedeganPct(rutaNombre: string | null | undefined): number {
  if (rutaNombre && RUTAS_SIN_DESCUENTO_FEDEGAN.has(rutaNombre)) return 0;
  return FEDEGAN_PCT;
}
