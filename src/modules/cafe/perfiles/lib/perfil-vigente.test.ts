import { describe, expect, it } from "vitest";
import { historialPerfil, proximoPerfil, resolverPerfilVigente } from "./perfil-vigente";
import type { PerfilTuesteTipo } from "../types";

const EXCELSO = "tipo-excelso";
const CONSUMO = "tipo-consumo";

const p = (id: string, tipo: string | null, nivel: PerfilTuesteTipo["nivel"], tempC: number, desde: string): PerfilTuesteTipo => ({
  id,
  tipoCafeId: tipo,
  nivel,
  tempC,
  tiempoMin: 17,
  vigenteDesde: desde,
});

const PERFILES: PerfilTuesteTipo[] = [
  p("e1", EXCELSO, "medio", 216, "2000-01-01"),
  p("e3", EXCELSO, "bajo", 210, "2027-03-01"),
  p("e2", EXCELSO, "alto", 220, "2026-12-01"),
  p("c1", CONSUMO, "medio", 222, "2000-01-01"),
  p("m1", null, "medio", 222, "2000-01-01"),
];

describe("resolverPerfilVigente", () => {
  it("antes del cambio rige la versión anterior (lotes anteriores no cambian)", () => {
    expect(resolverPerfilVigente(PERFILES, EXCELSO, "2026-11-30")?.id).toBe("e1");
  });

  it("el día de vigencia ya rige la nueva", () => {
    expect(resolverPerfilVigente(PERFILES, EXCELSO, "2026-12-01")?.id).toBe("e2");
  });

  it("entre dos cambios rige la más reciente ya vigente, sin importar el orden de entrada", () => {
    expect(resolverPerfilVigente(PERFILES, EXCELSO, "2027-02-28")?.id).toBe("e2");
    expect(resolverPerfilVigente(PERFILES, EXCELSO, "2027-03-01")?.id).toBe("e3");
  });

  it("cada tipo tiene su perfil; Excelso no afecta a Consumo", () => {
    expect(resolverPerfilVigente(PERFILES, CONSUMO, "2027-03-01")?.id).toBe("c1");
  });

  it("tipoCafeId null resuelve el de maquila", () => {
    expect(resolverPerfilVigente(PERFILES, null, "2026-11-30")?.id).toBe("m1");
  });

  it("sin perfil a esa fecha o para un tipo nuevo devuelve null", () => {
    expect(resolverPerfilVigente(PERFILES, EXCELSO, "1999-12-31")).toBeNull();
    expect(resolverPerfilVigente(PERFILES, "tipo-nuevo", "2026-11-30")).toBeNull();
    expect(resolverPerfilVigente([], null, "2026-11-30")).toBeNull();
  });
});

describe("historialPerfil", () => {
  it("ordena de la más reciente a la más antigua sin mutar la entrada", () => {
    const copia = [...PERFILES];
    expect(historialPerfil(PERFILES, EXCELSO).map((x) => x.id)).toEqual(["e3", "e2", "e1"]);
    expect(PERFILES).toEqual(copia);
  });
});

describe("proximoPerfil", () => {
  it("devuelve la siguiente versión aún no vigente", () => {
    expect(proximoPerfil(PERFILES, EXCELSO, "2026-11-30")?.id).toBe("e2");
    expect(proximoPerfil(PERFILES, EXCELSO, "2026-12-01")?.id).toBe("e3");
  });

  it("null si no hay futuras", () => {
    expect(proximoPerfil(PERFILES, EXCELSO, "2027-03-01")).toBeNull();
    expect(proximoPerfil(PERFILES, CONSUMO, "2026-11-30")).toBeNull();
  });
});
