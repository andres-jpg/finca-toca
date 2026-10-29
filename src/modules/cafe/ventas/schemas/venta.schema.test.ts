import { describe, expect, it } from "vitest";
import { anularVentaSchema, completarFacturaSchema, payloadVenta, ventaSchema, type VentaFormInput } from "./venta.schema";

const CLIENTE = "3f2a1b4c-0d5e-4f60-8a71-92b3c4d5e6f7";
const P1 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const P2 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2";

const base: VentaFormInput = {
  tipo: "venta",
  fecha: "2026-11-08",
  terceroId: CLIENTE,
  lineas: [
    { articuloId: P1, cantidad: "3", precio: "23.000" },
    { articuloId: P2, cantidad: 1, precio: 29000 },
  ],
};

const mensaje = (r: ReturnType<typeof ventaSchema.safeParse>) => (r.success ? null : r.error.issues[0]?.message);

describe("ventaSchema", () => {
  it("normaliza unidades con punto de miles y precios en formato colombiano", () => {
    const r = ventaSchema.safeParse({ ...base, lineas: [{ articuloId: P1, cantidad: "1.200", precio: "$ 23.000,50" }] });
    expect(r.success && r.data.lineas[0]).toEqual({ articuloId: P1, cantidad: 1200, precio: 23000.5 });
  });

  it("el ejemplo de la tarea: dos líneas válidas", () => {
    const r = ventaSchema.safeParse(base);
    expect(r.success && r.data.lineas.map((l) => [l.cantidad, l.precio])).toEqual([[3, 23000], [1, 29000]]);
  });

  it("una venta exige el precio de cada línea", () => {
    expect(mensaje(ventaSchema.safeParse({ ...base, lineas: [{ articuloId: P1, cantidad: "1", precio: "" }] }))).toBe("Indica el precio de cada producto");
    expect(mensaje(ventaSchema.safeParse({ ...base, lineas: [{ articuloId: P1, cantidad: "1", precio: "0" }] }))).toBe("Indica el precio de cada producto");
  });

  it("una cortesía fuerza el precio a 0 aunque se mande otro (y no lo pide)", () => {
    const r = ventaSchema.safeParse({ ...base, tipo: "cortesia", lineas: [{ articuloId: P2, cantidad: "2", precio: "29000" }, { articuloId: P1, cantidad: "1" }] });
    expect(r.success && r.data.lineas.map((l) => l.precio)).toEqual([0, 0]);
  });

  it("cantidad: entero mayor que cero", () => {
    expect(mensaje(ventaSchema.safeParse({ ...base, lineas: [{ articuloId: P1, cantidad: "0", precio: "100" }] }))).toBe("Las unidades son un número entero mayor que cero");
    expect(mensaje(ventaSchema.safeParse({ ...base, lineas: [{ articuloId: P1, cantidad: "1,5", precio: "100" }] }))).toBe("Las unidades son un número entero mayor que cero");
  });

  it("precio: máximo 2 decimales y no negativo", () => {
    expect(mensaje(ventaSchema.safeParse({ ...base, lineas: [{ articuloId: P1, cantidad: "1", precio: "100,555" }] }))).toBe("El precio admite como máximo 2 decimales");
    expect(mensaje(ventaSchema.safeParse({ ...base, lineas: [{ articuloId: P1, cantidad: "1", precio: "abc" }] }))).toBe("El precio debe ser un número válido");
  });

  it("al menos una línea, sin productos repetidos", () => {
    expect(mensaje(ventaSchema.safeParse({ ...base, lineas: [] }))).toBe("Añade al menos un producto");
    expect(mensaje(ventaSchema.safeParse({ ...base, lineas: [{ articuloId: P1, cantidad: "1", precio: "5" }, { articuloId: P1, cantidad: "2", precio: "5" }] }))).toMatch(/repetido/);
  });

  it("el cliente es obligatorio", () => {
    expect(mensaje(ventaSchema.safeParse({ ...base, terceroId: null as unknown as string }))).toBe("Elige el cliente");
  });

  it("factura: el número solo con «requiere factura»; una cortesía no se factura", () => {
    expect(mensaje(ventaSchema.safeParse({ ...base, numeroFactura: "FE-1" }))).toMatch(/requiere factura/);
    expect(mensaje(ventaSchema.safeParse({ ...base, tipo: "cortesia", requiereFactura: true }))).toBe("Una cortesía no lleva factura");
  });

  it("«requiere factura» sin número es válido (queda pendiente)", () => {
    const r = ventaSchema.safeParse({ ...base, requiereFactura: true, numeroFactura: "  " });
    expect(r.success && [r.data.requiereFactura, r.data.numeroFactura]).toEqual([true, null]);
  });
});

describe("payloadVenta", () => {
  it("usa los nombres que espera cafe.registrar_venta", () => {
    const r = ventaSchema.safeParse({ ...base, requiereFactura: true, numeroFactura: " FE-1001 ", observaciones: "  " });
    expect(r.success && payloadVenta(r.data)).toEqual({
      tipo: "venta",
      fecha: "2026-11-08",
      tercero_id: CLIENTE,
      requiere_factura: true,
      numero_factura_aliados: "FE-1001",
      observaciones: null,
      lineas: [
        { articulo_id: P1, cantidad: 3, precio_unitario: 23000 },
        { articulo_id: P2, cantidad: 1, precio_unitario: 29000 },
      ],
    });
  });
});

describe("anularVentaSchema", () => {
  it("exige un motivo de al menos 3 caracteres", () => {
    expect(anularVentaSchema.safeParse({ ventaId: CLIENTE, motivo: "  " }).success).toBe(false);
    expect(anularVentaSchema.safeParse({ ventaId: CLIENTE, motivo: " el cliente devolvió " })).toMatchObject({ success: true, data: { motivo: "el cliente devolvió" } });
  });
});

describe("completarFacturaSchema", () => {
  it("exige el número y lo recorta", () => {
    expect(completarFacturaSchema.safeParse({ ventaId: CLIENTE, numeroFactura: "" }).success).toBe(false);
    expect(completarFacturaSchema.safeParse({ ventaId: CLIENTE, numeroFactura: " FE-9 " })).toMatchObject({ success: true, data: { numeroFactura: "FE-9" } });
    expect(completarFacturaSchema.safeParse({ ventaId: CLIENTE, numeroFactura: "x".repeat(41) }).success).toBe(false);
  });
});
