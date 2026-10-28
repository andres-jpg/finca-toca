import type { LineaLote, TipoProceso } from "../types";

// Cómo se llama un lote para quien lo mira (HU-F1-12). En la base solo hay dos líneas (`marca_propia`, `servicio`);
// el tipo que ve el usuario sale de la línea y de los servicios contratados. Función pura (sin base ni React).

/** Lo que se muestra como «Tipo» de un lote. */
export type TipoVisibleLote = "marca_propia" | "trilla" | "maquila" | "trilla_maquila";

const ETIQUETA: Readonly<Record<TipoVisibleLote, string>> = {
  marca_propia: "Marca propia",
  trilla: "Trilla",
  maquila: "Maquila",
  trilla_maquila: "Trilla + maquila",
};

/** Servicios que cuentan como maquila (todo lo que viene después de la trilla). */
export const SERVICIOS_MAQUILA: readonly TipoProceso[] = ["tostion", "molienda", "empaque"];

/**
 * Marca propia → «Marca propia». Servicio: solo trilla → «Trilla»; solo tostión/molienda/empaque → «Maquila»;
 * trilla y alguno de esos → «Trilla + maquila». Una lista de servicios vacía (que la base no permite) se muestra
 * como maquila.
 */
export function tipoVisibleLote(linea: LineaLote, servicios: readonly TipoProceso[]): TipoVisibleLote {
  if (linea === "marca_propia") return "marca_propia";
  const trilla = servicios.includes("trilla");
  const maquila = servicios.some((s) => SERVICIOS_MAQUILA.includes(s));
  if (trilla && maquila) return "trilla_maquila";
  return trilla ? "trilla" : "maquila";
}

export function etiquetaTipoLote(tipo: TipoVisibleLote): string {
  return ETIQUETA[tipo];
}

/** Clases de la insignia de cada tipo. */
export function colorTipoLote(tipo: TipoVisibleLote): string {
  switch (tipo) {
    case "marca_propia":
      return "bg-amber-100 text-amber-800 hover:bg-amber-100";
    case "trilla":
      return "bg-stone-200 text-stone-800 hover:bg-stone-200";
    case "maquila":
      return "bg-sky-100 text-sky-800 hover:bg-sky-100";
    case "trilla_maquila":
      return "bg-violet-100 text-violet-800 hover:bg-violet-100";
  }
}
