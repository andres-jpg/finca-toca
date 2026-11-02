import { describe, expect, it } from "vitest";
import { textoPerfilTueste } from "./perfil-tueste";

describe("textoPerfilTueste", () => {
  it("nivel, temperatura y tiempo", () => {
    expect(textoPerfilTueste({ nivel: "medio", tempC: 205, tiempoMin: 12 })).toBe("medio · 205 °C · 12 min");
  });
  it("omite lo que no se indicó", () => {
    expect(textoPerfilTueste({ nivel: "alto" })).toBe("alto");
    expect(textoPerfilTueste({ nivel: "bajo", tempC: 190, tiempoMin: null })).toBe("bajo · 190 °C");
    expect(textoPerfilTueste({ nivel: "bajo", tiempoMin: 10.5 })).toBe("bajo · 10,5 min");
  });
  it("sin nivel no hay perfil", () => {
    expect(textoPerfilTueste({ nivel: null, tempC: 200 })).toBeNull();
  });
});
