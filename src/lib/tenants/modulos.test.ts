import { describe, expect, it } from "vitest";
import { slugTieneModulo } from "./modulos";

describe("slugTieneModulo", () => {
  it("Villa Blanca tiene el módulo de arriendos", () => {
    expect(slugTieneModulo("villa-blanca", "arriendos")).toBe(true);
  });

  it("El Velero y cualquier otro cliente no lo tienen", () => {
    expect(slugTieneModulo("el-velero", "arriendos")).toBe(false);
    expect(slugTieneModulo("otro-cliente", "arriendos")).toBe(false);
  });

  it("sin slug (null, undefined o vacío) no hay módulo", () => {
    expect(slugTieneModulo(null, "arriendos")).toBe(false);
    expect(slugTieneModulo(undefined, "arriendos")).toBe(false);
    expect(slugTieneModulo("", "arriendos")).toBe(false);
  });

  it("compara el slug exacto, sin normalizar mayúsculas", () => {
    expect(slugTieneModulo("Villa-Blanca", "arriendos")).toBe(false);
  });
});
