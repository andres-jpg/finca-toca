import { describe, expect, it } from "vitest";
import {
  actualizarArticuloSchema,
  aMovimiento,
  crearArticuloSchema,
  movimientoFormSchema,
  movimientoSchema,
  registrarMovimientosSchema,
} from "./inventario.schemas";

const ARTICULO = "3f1c2b8e-5a4d-4c6e-9b7a-1d2e3f4a5b6c";

function primerMensaje(resultado: { success: boolean; error?: { issues: { message: string }[] } }): string {
  return resultado.error?.issues[0]?.message ?? "";
}

describe("crearArticuloSchema", () => {
  it("acepta un artículo completo y normaliza los vacíos a null", () => {
    const r = crearArticuloSchema.safeParse({
      codigo: "  ",
      nombre: "  Bolsa 500 g ",
      tipo: "insumo",
      unidad: "unidad",
      atributos: { clase: "bolsa", presentacion_g: 500 },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.nombre).toBe("Bolsa 500 g");
      expect(r.data.codigo).toBeNull();
      expect(r.data.stock_minimo).toBeNull();
    }
  });

  it("exige nombre, tipo y unidad, con mensajes en español", () => {
    expect(primerMensaje(crearArticuloSchema.safeParse({ nombre: "", tipo: "insumo", unidad: "unidad", atributos: {} })))
      .toBe("El nombre es obligatorio");
    expect(primerMensaje(crearArticuloSchema.safeParse({ nombre: "X", tipo: "otra", unidad: "unidad", atributos: {} })))
      .toBe("Elige el tipo de artículo");
    expect(primerMensaje(crearArticuloSchema.safeParse({ nombre: "X", tipo: "otro", unidad: "docena", atributos: {} })))
      .toBe("Elige la unidad");
  });

  it("el stock mínimo no puede ser negativo, pero 0 y null valen", () => {
    const base = { nombre: "X", tipo: "otro", unidad: "unidad", atributos: {} };
    expect(primerMensaje(crearArticuloSchema.safeParse({ ...base, stock_minimo: -1 }))).toBe("El stock mínimo no puede ser negativo");
    expect(crearArticuloSchema.safeParse({ ...base, stock_minimo: 0 }).success).toBe(true);
    expect(crearArticuloSchema.safeParse({ ...base, stock_minimo: null }).success).toBe(true);
  });

  it("los atributos son un objeto plano de texto, número o booleano", () => {
    const base = { nombre: "X", tipo: "otro", unidad: "unidad" };
    expect(crearArticuloSchema.safeParse({ ...base, atributos: { a: { b: 1 } } }).success).toBe(false);
    expect(crearArticuloSchema.safeParse({ ...base, atributos: [1] }).success).toBe(false);
    expect(crearArticuloSchema.safeParse({ ...base, atributos: { a: "x", b: 2, c: true } }).success).toBe(true);
  });
});

describe("actualizarArticuloSchema", () => {
  it("acepta cambios parciales", () => {
    expect(actualizarArticuloSchema.safeParse({ stock_minimo: 25 }).success).toBe(true);
    expect(actualizarArticuloSchema.safeParse({ activo: false }).success).toBe(true);
  });

  it("rechaza un cambio vacío", () => {
    expect(primerMensaje(actualizarArticuloSchema.safeParse({}))).toBe("No hay cambios que guardar");
  });

  it("no deja pasar tipo ni unidad (la base los bloquea)", () => {
    const r = actualizarArticuloSchema.safeParse({ nombre: "Nuevo", tipo: "otro", unidad: "kg" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ nombre: "Nuevo" });
  });

  it("solo toca las claves enviadas", () => {
    const r = actualizarArticuloSchema.safeParse({ stock_minimo: 5 });
    expect(r.success && Object.keys(r.data)).toEqual(["stock_minimo"]);
  });
});

describe("movimientoSchema", () => {
  const base = { articulo_id: ARTICULO, cantidad: 5, motivo: "compra" };

  it("acepta una entrada y una salida coherentes", () => {
    expect(movimientoSchema.safeParse(base).success).toBe(true);
    expect(movimientoSchema.safeParse({ ...base, cantidad: -5, motivo: "venta" }).success).toBe(true);
  });

  it("el motivo es obligatorio", () => {
    expect(primerMensaje(movimientoSchema.safeParse({ articulo_id: ARTICULO, cantidad: 5 }))).toBe("El motivo es obligatorio");
    expect(primerMensaje(movimientoSchema.safeParse({ ...base, motivo: "regalo" }))).toBe("El motivo es obligatorio");
  });

  it("rechaza el signo incoherente con el motivo", () => {
    expect(primerMensaje(movimientoSchema.safeParse({ ...base, cantidad: -5 }))).toMatch(/entrada/);
    expect(primerMensaje(movimientoSchema.safeParse({ ...base, cantidad: 5, motivo: "venta" }))).toMatch(/salida/);
  });

  it("rechaza cantidad cero y no numérica", () => {
    expect(primerMensaje(movimientoSchema.safeParse({ ...base, cantidad: 0 }))).toBe("La cantidad no puede ser cero");
    expect(primerMensaje(movimientoSchema.safeParse({ ...base, cantidad: "5" }))).toBe("Indica la cantidad");
    expect(primerMensaje(movimientoSchema.safeParse({ ...base, cantidad: NaN }))).toBe("Indica la cantidad");
  });

  it("un ajuste exige observación, con cualquier signo", () => {
    const r = movimientoSchema.safeParse({ ...base, motivo: "ajuste", cantidad: -2 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["observaciones"]);
    expect(movimientoSchema.safeParse({ ...base, motivo: "ajuste", cantidad: -2, observaciones: "  " }).success).toBe(false);
    expect(movimientoSchema.safeParse({ ...base, motivo: "ajuste", cantidad: -2, observaciones: "Conteo físico" }).success).toBe(true);
  });

  it("exige un artículo válido y un costo no negativo", () => {
    expect(primerMensaje(movimientoSchema.safeParse({ ...base, articulo_id: "nope" }))).toBe("Elige un artículo");
    expect(primerMensaje(movimientoSchema.safeParse({ ...base, costo_unitario: -1 }))).toBe("El costo no puede ser negativo");
  });
});

describe("registrarMovimientosSchema", () => {
  const mov = { articulo_id: ARTICULO, cantidad: 5, motivo: "compra" };

  it("permitirNegativo es false por defecto", () => {
    const r = registrarMovimientosSchema.safeParse({ movimientos: [mov] });
    expect(r.success && r.data.permitirNegativo).toBe(false);
  });

  it("al menos uno y como máximo 100", () => {
    expect(primerMensaje(registrarMovimientosSchema.safeParse({ movimientos: [] }))).toBe("Indica al menos un movimiento");
    expect(registrarMovimientosSchema.safeParse({ movimientos: Array(101).fill(mov) }).success).toBe(false);
    expect(registrarMovimientosSchema.safeParse({ movimientos: Array(100).fill(mov) }).success).toBe(true);
  });

  it("un movimiento inválido invalida la operación entera", () => {
    expect(registrarMovimientosSchema.safeParse({ movimientos: [mov, { ...mov, cantidad: 0 }] }).success).toBe(false);
  });
});

describe("movimientoFormSchema + aMovimiento", () => {
  const base = { articulo_id: ARTICULO, motivo: "venta", cantidad: 3 };

  it("la cantidad del formulario es positiva", () => {
    expect(primerMensaje(movimientoFormSchema.safeParse({ ...base, cantidad: 0 }))).toBe("La cantidad debe ser mayor a 0");
    expect(primerMensaje(movimientoFormSchema.safeParse({ ...base, cantidad: -3 }))).toBe("La cantidad debe ser mayor a 0");
  });

  it("el motivo es obligatorio", () => {
    expect(primerMensaje(movimientoFormSchema.safeParse({ articulo_id: ARTICULO, cantidad: 3 }))).toBe("El motivo es obligatorio");
  });

  it("un ajuste exige dirección y observación", () => {
    const sin = movimientoFormSchema.safeParse({ ...base, motivo: "ajuste" });
    expect(sin.error?.issues.map((i) => i.path[0]).sort()).toEqual(["direccion", "observaciones"]);
    expect(movimientoFormSchema.safeParse({ ...base, motivo: "ajuste", direccion: "salida", observaciones: "Merma" }).success).toBe(true);
  });

  it("aMovimiento aplica el signo del motivo y produce un movimiento válido para la RPC", () => {
    const venta = movimientoFormSchema.parse(base);
    expect(aMovimiento(venta).cantidad).toBe(-3);
    expect(movimientoSchema.safeParse(aMovimiento(venta)).success).toBe(true);

    const ajuste = movimientoFormSchema.parse({ ...base, motivo: "ajuste", direccion: "salida", observaciones: "Merma" });
    expect(aMovimiento(ajuste)).toMatchObject({ cantidad: -3, motivo: "ajuste", observaciones: "Merma" });
    expect(movimientoSchema.safeParse(aMovimiento(ajuste)).success).toBe(true);

    const compra = movimientoFormSchema.parse({ ...base, motivo: "compra", costo_unitario: 1200 });
    expect(aMovimiento(compra)).toMatchObject({ cantidad: 3, costo_unitario: 1200 });
  });
});
