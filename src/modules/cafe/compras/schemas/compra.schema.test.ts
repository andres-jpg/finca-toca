import { describe, expect, it } from "vitest";
import { aPayloadCompra, compraSchema, type CompraFormInput } from "./compra.schema";

const UUID_TIPO = "0f6c7b1e-3a52-4c8e-9d41-6a1f2b3c4d5e";
const UUID_PROV = "9b2d4e6f-1c3a-4b5d-8e7f-0a1b2c3d4e5f";

// La compra de aceptación: 375 kg en 6 bultos de Excelso a $18.500/kg.
const base: CompraFormInput = {
  tipoCafeId: UUID_TIPO,
  terceroId: UUID_PROV,
  fecha: "2026-11-05",
  pesoKg: 375,
  numBultos: 6,
  pesosBultos: null,
  precioKg: 18500,
  facturaProveedor: "",
  observaciones: "",
};

const primerError = (input: unknown) => {
  const r = compraSchema.safeParse(input);
  return r.success ? null : r.error.issues[0]?.message;
};

describe("compraSchema", () => {
  it("acepta la compra de aceptación y normaliza los opcionales vacíos a null", () => {
    const r = compraSchema.parse(base);
    expect(r).toMatchObject({ pesoKg: 375, numBultos: 6, precioKg: 18500, pesosBultos: null, facturaProveedor: null, observaciones: null });
  });

  it("recorta los textos y admite pesosBultos ausente", () => {
    const { pesosBultos: _omitido, ...sinPesos } = base;
    void _omitido;
    const r = compraSchema.parse({ ...sinPesos, facturaProveedor: "  FV-1234 ", observaciones: " nota " });
    expect(r.facturaProveedor).toBe("FV-1234");
    expect(r.observaciones).toBe("nota");
    expect(r.pesosBultos).toBeNull();
  });

  it("exige tipo de café y proveedor válidos", () => {
    expect(primerError({ ...base, tipoCafeId: "" })).toBe("Elige el tipo de café");
    expect(primerError({ ...base, terceroId: "abc" })).toBe("Elige el proveedor");
  });

  it("valida la fecha como día real del calendario", () => {
    expect(primerError({ ...base, fecha: "05/11/2026" })).toBe("La fecha no es válida");
    expect(primerError({ ...base, fecha: "2026-02-31" })).toBe("La fecha no es válida");
    expect(compraSchema.safeParse({ ...base, fecha: "2028-02-29" }).success).toBe(true);
  });

  it("el peso debe ser positivo y con hasta 3 decimales", () => {
    expect(primerError({ ...base, pesoKg: 0 })).toBe("El peso debe ser mayor que cero");
    expect(primerError({ ...base, pesoKg: -1 })).toBe("El peso debe ser mayor que cero");
    expect(primerError({ ...base, pesoKg: 100.0005 })).toBe("El peso admite hasta 3 decimales (gramos)");
    expect(primerError({ ...base, pesoKg: Number.NaN })).toBe("Indica el peso total en kilos");
    expect(compraSchema.safeParse({ ...base, pesoKg: 62.5, numBultos: 1 }).success).toBe(true);
  });

  it("el número de bultos es un entero de 1 a 200", () => {
    expect(primerError({ ...base, numBultos: 0 })).toBe("Debe haber al menos 1 bulto");
    expect(primerError({ ...base, numBultos: 2.5 })).toBe("El número de bultos debe ser un entero");
    expect(primerError({ ...base, numBultos: 201 })).toBe("Máximo 200 bultos");
  });

  it("el precio admite 0 pero no negativos ni más de 2 decimales", () => {
    expect(compraSchema.safeParse({ ...base, precioKg: 0 }).success).toBe(true);
    expect(compraSchema.safeParse({ ...base, precioKg: 18500.5 }).success).toBe(true);
    expect(primerError({ ...base, precioKg: -1 })).toBe("El precio no puede ser negativo");
    expect(primerError({ ...base, precioKg: 18500.123 })).toBe("El precio admite hasta 2 decimales");
    expect(primerError({ ...base, precioKg: Number.NaN })).toBe("Indica el precio por kilo");
  });

  it("limita la factura y las observaciones", () => {
    expect(primerError({ ...base, facturaProveedor: "x".repeat(61) })).toBe("Máximo 60 caracteres");
    expect(primerError({ ...base, observaciones: "x".repeat(501) })).toBe("Máximo 500 caracteres");
  });

  describe("pesos por bulto", () => {
    it("acepta los que son n y suman el total", () => {
      const r = compraSchema.safeParse({ ...base, pesoKg: 100, numBultos: 2, pesosBultos: [40.5, 59.5] });
      expect(r.success).toBe(true);
    });

    it("avisa si no suman el total", () => {
      expect(primerError({ ...base, pesosBultos: [60, 60, 60, 60, 60, 60] })).toBe("Los pesos por bulto no suman el peso total");
    });

    it("avisa si no son tantos como bultos", () => {
      expect(primerError({ ...base, pesosBultos: [187.5, 187.5] })).toBe("Hay 2 pesos por bulto y 6 bultos");
    });

    it("cada bulto debe pesar más de cero", () => {
      expect(primerError({ ...base, pesosBultos: [375, 0, 0, 0, 0, 0] })).toBe("El peso debe ser mayor que cero");
    });
  });

  it("aPayloadCompra usa los nombres de la RPC", () => {
    expect(aPayloadCompra(compraSchema.parse({ ...base, facturaProveedor: "FV-1" }))).toEqual({
      tercero_id: UUID_PROV,
      tipo_cafe_id: UUID_TIPO,
      fecha: "2026-11-05",
      peso_kg: 375,
      num_bultos: 6,
      pesos_bultos: null,
      precio_kg: 18500,
      factura_proveedor: "FV-1",
      observaciones: null,
    });
  });
});
