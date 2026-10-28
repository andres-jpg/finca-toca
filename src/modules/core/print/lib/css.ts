import { MEDIDAS, type AnchoImpresora } from "./ancho";

/**
 * Alto de la página, en mm. El issue pedía `size: 80mm auto`, pero Chrome descarta esa declaración entera
 * (`auto` no es válido como dimensión) y imprime en Carta, verificado con `--print-to-pdf`. Un alto fijo sí se
 * respeta; 297 mm cabe un tiquete largo sin partirlo. Es lo único que hay que tocar si, calibrando con la
 * impresora real, el driver deja demasiado papel en blanco tras el corte.
 */
export const ALTO_PAGINA_MM = 297;

/**
 * CSS de la hoja térmica para un ancho de rollo. Puro: el layout lo inyecta en un `<style>`.
 *
 * - `@page { size: <ancho>mm <ALTO_PAGINA_MM>mm; margin: 0 }`: es la única regla que no se puede acotar a un
 *   elemento, por eso el CSS se genera por ancho y no con variables.
 * - En impresión el `body` mide el cuerpo imprimible y deja el margen lateral (72 mm + 4 mm a cada lado en
 *   80 mm; 48 mm + 5 mm en 58 mm), así el borde del papel, que muchas térmicas no imprimen, queda libre.
 * - Cada `.ticket` termina con un salto de página: así la copia del cliente sale en un tiquete aparte y el
 *   último no deja una página en blanco.
 * - En pantalla (la vista previa del navegador) la hoja se dibuja centrada con el ancho real del papel.
 */
export function cssImpresionTermica(ancho: AnchoImpresora): string {
  const { papelMm, cuerpoMm, margenMm } = MEDIDAS[ancho];
  return `
@page { size: ${papelMm}mm ${ALTO_PAGINA_MM}mm; margin: 0; }

.hoja-termica {
  box-sizing: border-box;
  width: ${papelMm}mm;
  margin: 16px auto;
  padding: 4mm ${margenMm}mm;
  background: #fff;
  color: #000;
  box-shadow: 0 1px 6px rgb(0 0 0 / 0.25);
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 9.5pt;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.hoja-termica * { box-sizing: border-box; }
.ticket + .ticket { margin-top: 6mm; padding-top: 4mm; border-top: 1px dashed #888; }

@media print {
  html, body { background: #fff !important; }
  body { width: ${cuerpoMm}mm; margin: 0 ${margenMm}mm; }
  .hoja-termica { width: auto; margin: 0; padding: 0; box-shadow: none; }
  .no-print { display: none !important; }
  .ticket + .ticket { margin-top: 0; padding-top: 0; border-top: 0; }
  .ticket { break-after: page; page-break-after: always; }
  .ticket:last-child { break-after: auto; page-break-after: auto; }
}
`.trim();
}
