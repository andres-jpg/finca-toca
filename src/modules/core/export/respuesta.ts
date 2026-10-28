export const CONTENT_TYPE_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Valor de `Content-Disposition` para descarga: nombre ASCII de respaldo + `filename*` (RFC 5987) con el real. */
export function contentDisposition(nombreArchivo: string): string {
  const ascii = nombreArchivo.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombreArchivo)}`;
}

/** Respuesta de descarga de un `.xlsx`. Nunca se cachea: es información del cliente. */
export function respuestaExcel(buffer: Buffer, nombreArchivo: string): Response {
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": CONTENT_TYPE_XLSX,
      "Content-Disposition": contentDisposition(nombreArchivo),
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}
