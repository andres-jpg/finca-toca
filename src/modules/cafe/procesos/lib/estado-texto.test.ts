import { describe, expect, it } from "vitest";
import { ayudaEstadoMerma, estadoDesdeSentido, ETIQUETA_ESTADO_MERMA } from "./estado-texto";

describe("texto del estado de merma", () => {
  it("etiquetas de la issue", () => {
    expect(ETIQUETA_ESTADO_MERMA).toEqual({ en_rango: "En rango", alta: "Revisar · alta", baja: "Verificar · baja" });
  });

  it("ayuda de tostión", () => {
    expect(ayudaEstadoMerma("alta", "tostion")).toBe("posible sobretueste o pérdida");
    expect(ayudaEstadoMerma("baja")).toBe("peso o desarrollo del tueste");
    expect(ayudaEstadoMerma("en_rango", "tostion")).toBeNull();
  });

  it("en trilla no habla de tueste", () => {
    expect(ayudaEstadoMerma("alta", "trilla")).not.toMatch(/tueste/);
  });

  it("sentido de la base", () => {
    expect(estadoDesdeSentido("alta")).toBe("alta");
    expect(estadoDesdeSentido("baja")).toBe("baja");
    expect(estadoDesdeSentido(null)).toBeNull();
    expect(estadoDesdeSentido("otro")).toBeNull();
  });
});
