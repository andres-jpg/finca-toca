// Lectura completa de una consulta que puede pasar de las 1000 filas del tope de PostgREST
// (`max_rows`, ver *PostgREST row cap* en CLAUDE.md). Generaliza el bucle de `fetchAllRecolecciones`.

export interface PaginaPostgrest<T> {
  data: T[] | null;
  error: { message: string; code?: string } | null;
}

/** Error propio para distinguir "la consulta falló" de "es demasiado grande" en quien llama. */
export class ExportError extends Error {
  constructor(
    readonly codigo: "consulta_fallida" | "export_demasiado_grande",
    message: string,
  ) {
    super(message);
    this.name = "ExportError";
  }
}

/**
 * Recorre todas las páginas de una consulta con `.range(desde, hasta)` hasta que una venga incompleta.
 *
 * `pagina(desde, hasta)` debe construir la consulta **desde cero** en cada llamada y **ordenarla** de forma
 * estable (`.order("fecha").order("id")`): sin orden determinista las páginas se solapan o saltan filas.
 * `pageSize` no debe superar el `max_rows` del proyecto (1000 por defecto): si lo supera, la primera página
 * vendría "incompleta" y se daría por terminada la lectura.
 *
 * A diferencia de `fetchAllRecolecciones` (que corta en silencio ante un error), aquí **lanza**: un Excel
 * truncado que parece completo es peor que un fallo. `limite` protege la memoria del servidor.
 */
export async function fetchAllPaginado<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<PaginaPostgrest<T>>,
  pageSize = 1000,
  limite = 50_000,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new RangeError("pageSize debe ser un entero positivo");
  const todas: T[] = [];
  for (let desde = 0; ; desde += pageSize) {
    const { data, error } = await pagina(desde, desde + pageSize - 1);
    // Sin texto del error de la base en el mensaje: puede traer datos del cliente.
    if (error) throw new ExportError("consulta_fallida", `No se pudo leer la consulta (${error.code ?? "sin código"})`);
    const filas = data ?? [];
    todas.push(...filas);
    if (todas.length > limite) {
      throw new ExportError("export_demasiado_grande", `La exportación supera ${limite} filas: acota los filtros`);
    }
    if (filas.length < pageSize) return todas;
  }
}
