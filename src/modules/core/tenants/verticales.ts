import type { Vertical } from "./tenant.queries";

/** Etiqueta en español de cada vertical, para badges y selectores. */
export const ETIQUETA_VERTICAL: Readonly<Record<Vertical, string>> = {
  ganaderia: "Ganadería",
  cooperativa: "Cooperativa",
  cafe: "Café",
};
