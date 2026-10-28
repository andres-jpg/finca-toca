import { describe, expect, it, vi } from "vitest";
import { ExportError, fetchAllPaginado, type PaginaPostgrest } from "./paginar";

/** Simula PostgREST: una tabla de `total` filas que devuelve a lo sumo `maxRows` por llamada. */
function tabla(total: number, maxRows = 1000) {
  const filas = Array.from({ length: total }, (_, i) => i);
  return vi.fn(async (desde: number, hasta: number): Promise<PaginaPostgrest<number>> => ({
    data: filas.slice(desde, Math.min(hasta + 1, desde + maxRows)),
    error: null,
  }));
}

describe("fetchAllPaginado", () => {
  it("trae todas las filas pasando de las 1000 de PostgREST", async () => {
    const pagina = tabla(2500);
    const todas = await fetchAllPaginado(pagina);
    expect(todas).toHaveLength(2500);
    expect(todas[2499]).toBe(2499);
    expect(pagina.mock.calls.map(([d, h]) => [d, h])).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("con un total múltiplo de la página pide una última página vacía", async () => {
    const pagina = tabla(2000);
    expect(await fetchAllPaginado(pagina)).toHaveLength(2000);
    expect(pagina).toHaveBeenCalledTimes(3);
  });

  it("tabla vacía o sin datos (null)", async () => {
    expect(await fetchAllPaginado(tabla(0))).toEqual([]);
    expect(await fetchAllPaginado(async () => ({ data: null, error: null }))).toEqual([]);
  });

  it("lanza si una página falla, sin filtrar el texto del error", async () => {
    const pagina = async (): Promise<PaginaPostgrest<number>> => ({ data: null, error: { message: "dato secreto", code: "42501" } });
    const error = await fetchAllPaginado(pagina).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ExportError);
    expect((error as ExportError).codigo).toBe("consulta_fallida");
    expect((error as ExportError).message).toContain("42501");
    expect((error as ExportError).message).not.toContain("secreto");
  });

  it("lanza export_demasiado_grande al pasar del límite", async () => {
    await expect(fetchAllPaginado(tabla(500), 100, 250)).rejects.toMatchObject({ codigo: "export_demasiado_grande" });
  });

  it("rechaza un pageSize inválido", async () => {
    await expect(fetchAllPaginado(tabla(1), 0)).rejects.toThrow(RangeError);
  });
});
