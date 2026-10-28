// Anchos de rollo térmico soportados y lo que cambia entre ellos. Puro.

export const ANCHOS_IMPRESORA = [58, 80] as const;
export type AnchoImpresora = (typeof ANCHOS_IMPRESORA)[number];

export const ANCHO_IMPRESORA_POR_DEFECTO: AnchoImpresora = 80;

/** Ancho del papel, del cuerpo imprimible (el papel menos los márgenes laterales) y margen a cada lado. */
export interface MedidasTicket {
  papelMm: number;
  cuerpoMm: number;
  margenMm: number;
}

export const MEDIDAS: Record<AnchoImpresora, MedidasTicket> = {
  80: { papelMm: 80, cuerpoMm: 72, margenMm: 4 },
  58: { papelMm: 58, cuerpoMm: 48, margenMm: 5 },
};

/** `?ancho=58|80` → el ancho, o `undefined` si falta o no es uno soportado (rige entonces el del cliente). */
export function parsearAncho(valor: string | string[] | undefined | null): AnchoImpresora | undefined {
  const crudo = Array.isArray(valor) ? valor[0] : valor;
  return ANCHOS_IMPRESORA.find((a) => String(a) === crudo?.trim());
}
