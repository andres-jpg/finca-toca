import type { ExportadorDef, ResultadoExport } from "@/modules/core/export/registry";
import { describirFiltros, parsearFiltros } from "./lib/filtros";
import { construirHojasLotes, ordenarProcesos } from "./lib/exportar";
import { leerLotesExport, leerProcesosExport } from "./queries/exportar.queries";

/**
 * Exportación de lotes y procesos a Excel (HU-F1-15): dos hojas, «Lotes» y «Procesos». Lee los filtros con
 * `parsearFiltros` y los traduce con `aplicarFiltrosLotes` (dentro de `leerLotesExport`), las mismas funciones que el
 * listado, de modo que el archivo trae exactamente los lotes de la pantalla (menos la paginación). Los procesos son
 * los de esos lotes, y el rango de fechas, además de acotar los lotes por su recepción, acota los procesos por la
 * suya. Cualquier miembro puede exportar (Gerencia incluida); el RLS aísla por cliente.
 */
export const exportadorLotes: ExportadorDef = {
  recurso: "cafe-lotes",
  etiqueta: "Lotes y procesos de café",
  modulo: "cafe.recepcion",
  roles: ["owner", "admin", "operativo", "viewer"],
  async generar({ filtros: parametros }): Promise<ResultadoExport> {
    const filtros = parsearFiltros(parametros);

    const lotes = await leerLotesExport(filtros);
    const procesos = ordenarProcesos(
      await leerProcesosExport(lotes, filtros),
      lotes.map((l) => l.codigo),
    );

    // La descripción de los filtros va como subtítulo de cada hoja (fila 2): «Tipo: Maquila · Estado: Parcial · …».
    // El tercero filtrado se nombra con el de sus lotes (todos son el mismo); sin lotes queda su id.
    const descripcion = describirFiltros(filtros, lotes[0]?.tercero ?? undefined);
    return {
      hojas: construirHojasLotes(lotes, procesos, descripcion),
      desde: filtros.desde ?? null,
      hasta: filtros.hasta ?? null,
    };
  },
};
