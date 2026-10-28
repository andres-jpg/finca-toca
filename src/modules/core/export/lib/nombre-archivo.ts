// Nombre del archivo exportado: `${slug}_${recurso}_${desde}_${hasta}.xlsx`. Puro.

const limpiar = (texto: string): string =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

export interface PartesNombreArchivo {
  /** Slug del cliente (`tenants.slug`). */
  slug: string;
  recurso: string;
  /** Extremos del rango (`YYYY-MM-DD`). Cada uno que falte se omite del nombre. */
  desde?: string | null;
  hasta?: string | null;
}

/** `cofradia_lotes_2026-01-01_2026-01-31.xlsx`; sin rango, `cofradia_lotes.xlsx`. */
export function nombreArchivoExport({ slug, recurso, desde, hasta }: PartesNombreArchivo): string {
  const partes = [slug, recurso, desde, hasta].map((p) => (p ? limpiar(p) : "")).filter(Boolean);
  return `${partes.join("_") || "exportacion"}.xlsx`;
}
