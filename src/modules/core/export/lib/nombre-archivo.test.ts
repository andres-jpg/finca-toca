import { describe, expect, it } from "vitest";
import { nombreArchivoExport } from "./nombre-archivo";

describe("nombreArchivoExport", () => {
  it("arma slug_recurso_desde_hasta.xlsx", () => {
    expect(nombreArchivoExport({ slug: "cofradia", recurso: "lotes", desde: "2026-01-01", hasta: "2026-01-31" })).toBe(
      "cofradia_lotes_2026-01-01_2026-01-31.xlsx",
    );
  });

  it("omite el rango que falta", () => {
    expect(nombreArchivoExport({ slug: "cofradia", recurso: "lotes" })).toBe("cofradia_lotes.xlsx");
    expect(nombreArchivoExport({ slug: "cofradia", recurso: "lotes", desde: "2026-01-01", hasta: null })).toBe("cofradia_lotes_2026-01-01.xlsx");
  });

  it("limpia caracteres que no valen en un nombre de archivo", () => {
    expect(nombreArchivoExport({ slug: "Villa Blanca/../x", recurso: "años" })).toBe("Villa-Blanca-..-x_anos.xlsx");
  });

  it("nunca devuelve un nombre vacío", () => {
    expect(nombreArchivoExport({ slug: "", recurso: "" })).toBe("exportacion.xlsx");
  });
});
