import { describe, expect, it } from "vitest";
import { aPayloadCompra, compraSchema, type CompraFormInput } from "./compra.schema";

const UUID_TIPO = "0f6c7b1e-3a52-4c8e-9d41-6a1f2b3c4d5e";
const UUID_PROV = "9b2d4e6f-1c3a-4b5d-8e7f-0a1b2c3d4e5f";

// La compra de aceptación: 375 kg de Excelso a $18.500/kg.
const base: CompraFormInput = {
  tipoCafeId: UUID_TIPO,
  terceroId: UUID_PROV,
  fecha: "2026-11-05",
  pesoKg: 375,
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
    expect(r).toMatchObject({ pesoKg: 375, precioKg: 18500, facturaProveedor: null, observaciones: null });
  });

  it("recorta los textos", () => {
    const r = compraSchema.parse({ ...base, facturaProveedor: "  FV-1234 ", observaciones: " nota " });
    expect(r.facturaProveedor).toBe("FV-1234");
    expect(r.observaciones).toBe("nota");
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
    expect(primerError({ ...base, pesoKg: Number.NaN })).toBe("Indica el peso recibido en kilos");
    expect(compraSchema.safeParse({ ...base, pesoKg: 62.5 }).success).toBe(true);
  });

  it("aPayloadCompra usa los nombres de la RPC", () => {
    expect(aPayloadCompra(compraSchema.parse({ ...base, facturaProveedor: "FV-1" }))).toEqual({
      tercero_id: UUID_PROV,
      tipo_cafe_id: UUID_TIPO,
      fecha: "2026-11-05",
      peso_kg: 375,
      precio_kg: 18500,
      factura_proveedor: "FV-1",
      observaciones: null,
    });
  });
});
