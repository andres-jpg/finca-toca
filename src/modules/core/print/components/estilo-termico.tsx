import { cssImpresionTermica } from "../lib/css";
import type { AnchoImpresora } from "../lib/ancho";

/**
 * Inyecta el CSS de la hoja térmica para un ancho. El layout `(print)` lo pone con el del cliente; una página
 * puede volver a ponerlo con otro ancho para calibrar (`?ancho=58`): al ir después, sus reglas `@page` y
 * `@media print` ganan.
 */
export function EstiloTermico({ ancho }: { ancho: AnchoImpresora }) {
  return <style dangerouslySetInnerHTML={{ __html: cssImpresionTermica(ancho) }} />;
}
