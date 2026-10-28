import { describe, expect, it } from "vitest";
import type { Remision } from "../types";
import { aEventoDeLinea, estadoRemision, etiquetaEstadoRemision, opcionGenerar, remisionVigente, rutaTiquete } from "./estado";

function remision(parcial: Partial<Remision> = {}): Remision {
  return {
    id: "r1",
    numero: "REM-2026-0001",
    loteId: "l1",
    loteCodigo: "MQ-2026-0007",
    fecha: "2026-11-12",
    terceroId: "t1",
    clienteNombre: "Juan Pérez",
    clienteIdentificacion: "1234567",
    pesoRecibidoKg: 500,
    pesoEntregadoKg: 330,
    mermaTotalKg: 170,
    detalle: [],
    valorServicios: 1923000,
    recibidoPor: null,
    observaciones: null,
    forzada: false,
    anulacion: null,
    creadoEn: "2026-11-12T20:00:00Z",
    creadoPor: "u1",
    ...parcial,
  };
}

describe("opcionGenerar", () => {
  it("un lote de servicio listo se remite sin más, a cualquiera que opere", () => {
    expect(opcionGenerar({ linea: "servicio", estado: "listo" }, false)).toBe("normal");
    expect(opcionGenerar({ linea: "servicio", estado: "listo" }, true)).toBe("normal");
  });

  it("con servicios pendientes solo un administrador puede forzar", () => {
    for (const estado of ["en_proceso", "parcial"]) {
      expect(opcionGenerar({ linea: "servicio", estado }, true)).toBe("forzar");
      expect(opcionGenerar({ linea: "servicio", estado }, false)).toBe("no");
    }
  });

  it("no se ofrece sin procesos, ya entregado, anulado, ni en marca propia", () => {
    for (const estado of ["recibido", "entregado", "anulado", null, undefined]) {
      expect(opcionGenerar({ linea: "servicio", estado }, true)).toBe("no");
    }
    expect(opcionGenerar({ linea: "marca_propia", estado: "listo" }, true)).toBe("no");
  });
});

describe("remisionVigente / estadoRemision", () => {
  const anulada = remision({ id: "r0", numero: "REM-2026-0000", anulacion: { en: "2026-11-12T21:00:00Z", motivo: "Error", por: "u2" } });

  it("la vigente es la única sin anular", () => {
    expect(remisionVigente([anulada, remision()])?.id).toBe("r1");
    expect(remisionVigente([anulada])).toBeNull();
    expect(remisionVigente([])).toBeNull();
  });

  it("estado y etiqueta", () => {
    expect(estadoRemision(remision())).toBe("vigente");
    expect(estadoRemision(anulada)).toBe("anulada");
    expect(etiquetaEstadoRemision("vigente")).toBe("Vigente");
    expect(etiquetaEstadoRemision("anulada")).toBe("Anulada");
  });
});

describe("rutaTiquete", () => {
  it("original y con copia (?copias = tiquetes en total)", () => {
    expect(rutaTiquete("abc")).toBe("/print/remision/abc");
    expect(rutaTiquete("abc", 1)).toBe("/print/remision/abc");
    expect(rutaTiquete("abc", 2)).toBe("/print/remision/abc?copias=2");
  });
});

describe("aEventoDeLinea", () => {
  const usuarios = new Map([["u1", "operativo@cofradia.test"], ["u2", "admin@cofradia.test"]]);

  it("resuelve quién la generó", () => {
    expect(aEventoDeLinea(remision(), usuarios)).toMatchObject({
      id: "r1",
      numero: "REM-2026-0001",
      fecha: "2026-11-12",
      creadoPor: "operativo@cofradia.test",
      pesoEntregadoKg: 330,
      mermaTotalKg: 170,
      valorServicios: 1923000,
      forzada: false,
      anulacion: null,
    });
  });

  it("una anulada conserva quién y por qué; un usuario desconocido queda en null", () => {
    const e = aEventoDeLinea(remision({ creadoPor: "uX", anulacion: { en: "2026-11-13T10:00:00Z", motivo: "Error", por: "u2" } }), usuarios);
    expect(e.creadoPor).toBeNull();
    expect(e.anulacion).toEqual({ en: "2026-11-13T10:00:00Z", por: "admin@cofradia.test", motivo: "Error" });
  });
});
