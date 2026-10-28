import { describe, expect, it } from "vitest";
import { defineParametros, getDefinicionParametro, limpiarDefinicionesParametros } from "../parametros/registry";
import { resolverParametro } from "../parametros/lib/valor";
import { PARAMETRO_IMPRESORA_ANCHO as def } from "./parametros";

describe("core.impresora_ancho_mm", () => {
  it("se puede registrar (clave válida y defecto que cumple su schema)", () => {
    limpiarDefinicionesParametros();
    defineParametros([def]);
    expect(getDefinicionParametro("core.impresora_ancho_mm")).toBe(def);
    limpiarDefinicionesParametros();
  });

  it("solo admite 58 u 80", () => {
    expect(def.schema.safeParse(58).success).toBe(true);
    expect(def.schema.safeParse(80).success).toBe(true);
    for (const v of [70, "80", 0, null, undefined]) expect(def.schema.safeParse(v).success).toBe(false);
  });

  it("rige 80 mm si no hay valor guardado o el guardado es inválido", () => {
    expect(resolverParametro(def, undefined)).toMatchObject({ valor: 80, origen: "defecto" });
    expect(resolverParametro(def, 58)).toMatchObject({ valor: 58, origen: "guardado" });
    expect(resolverParametro(def, 72)).toMatchObject({ valor: 80, invalido: true });
  });
});
