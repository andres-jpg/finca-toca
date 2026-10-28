import type { ExportadorDef, ResultadoExport } from "../export/registry";
import { parametro } from "../export/registry";
import { ETIQUETA_ROL_TERCERO_CORTA, ROLES_TERCERO, type RolTercero } from "./lib/roles";
import { listarTerceros, type FiltrosTerceros } from "./queries/terceros.queries";
import type { Tercero } from "./types";

type Estado = "activos" | "inactivos" | "todos";

const ETIQUETA_ESTADO: Record<Estado, string> = { activos: "Activos", inactivos: "Inactivos", todos: "Todos" };

/** Interpreta los `searchParams` de la pantalla: `q`, `rol` y `estado` (por defecto, solo activos). */
function leerFiltros(filtros: URLSearchParams): { filtros: FiltrosTerceros; estado: Estado } {
  const rolCrudo = parametro(filtros, "rol");
  const rol = ROLES_TERCERO.find((r): r is RolTercero => r === rolCrudo);
  const estadoCrudo = parametro(filtros, "estado");
  const estado: Estado = estadoCrudo === "inactivos" || estadoCrudo === "todos" ? estadoCrudo : "activos";
  return {
    estado,
    filtros: {
      q: parametro(filtros, "q"),
      rol,
      activo: estado === "todos" ? undefined : estado === "activos",
    },
  };
}

/**
 * Exportación del maestro de terceros: la primera del registro y la de referencia para los verticales. Usa la
 * misma consulta que la pantalla (`listarTerceros`, paginada), así que respeta los mismos filtros y el RLS
 * aísla por cliente; sin el módulo `core.terceros` ni la ruta ni las filas salen.
 */
export const exportadorTerceros: ExportadorDef = {
  recurso: "terceros",
  etiqueta: "Terceros",
  modulo: "core.terceros",
  roles: ["owner", "admin", "operativo", "viewer"],
  async generar({ filtros }): Promise<ResultadoExport> {
    const { filtros: consulta, estado } = leerFiltros(filtros);
    const filas = await listarTerceros(consulta);

    return {
      hojas: [
        {
          nombre: "Terceros",
          titulo: "Terceros",
          filas,
          columnas: [
            { header: "Nombre", key: "nombre", width: 34 },
            { header: "Tipo de identificación", key: "tipo_identificacion", width: 14 },
            { header: "Identificación", key: "identificacion", width: 18 },
            { header: "DV", key: "digito_verificacion", formato: "entero", width: 6 },
            { header: "Roles", key: (t: Tercero) => t.roles.map((r) => ETIQUETA_ROL_TERCERO_CORTA[r] ?? r).join(", "), width: 24 },
            { header: "Teléfono", key: "telefono", width: 16 },
            { header: "Email", key: "email", width: 28 },
            { header: "Dirección", key: "direccion", width: 34 },
            { header: "Estado", key: (t: Tercero) => (t.activo ? "Activo" : "Inactivo"), width: 10 },
            { header: "Creado", key: "created_at", formato: "fecha" },
          ],
        },
      ],
      filtrosAplicados: {
        Estado: ETIQUETA_ESTADO[estado],
        ...(consulta.rol ? { Rol: ETIQUETA_ROL_TERCERO_CORTA[consulta.rol] } : {}),
        ...(consulta.q ? { Búsqueda: consulta.q } : {}),
      },
    };
  },
};
