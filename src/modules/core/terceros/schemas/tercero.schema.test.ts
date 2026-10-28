import { describe, expect, it } from "vitest";
import { buscarSimilaresSchema, terceroSchema } from "./tercero.schema";

const valido = {
  tipo_identificacion: "NIT" as const,
  identificacion: "900.123.456-7",
  digito_verificacion: "7",
  nombre: "  Café   Pepe S.A.S. ",
  direccion: " Calle 10 # 5-20 ",
  telefono: "300 123 4567",
  email: " Pepe@Cafe.CO ",
  roles: ["proveedor", "cliente"] as ("proveedor" | "cliente")[],
  observaciones: "  Entrega los lunes ",
};

function mensajes(entrada: unknown): string[] {
  const r = terceroSchema.safeParse(entrada);
  return r.success ? [] : r.error.issues.map((i) => i.message);
}

describe("terceroSchema — casos válidos", () => {
  it("normaliza identificación, nombre, correo y textos", () => {
    const r = terceroSchema.parse(valido);
    expect(r).toEqual({
      tipo_identificacion: "NIT",
      identificacion: "9001234567",
      digito_verificacion: 7,
      nombre: "Café Pepe S.A.S.",
      direccion: "Calle 10 # 5-20",
      telefono: "300 123 4567",
      email: "pepe@cafe.co",
      roles: ["proveedor", "cliente"],
      observaciones: "Entrega los lunes",
    });
  });

  it("el correo es opcional (ausente, null o en blanco → null)", () => {
    for (const email of [undefined, null, "", "   "]) {
      expect(terceroSchema.parse({ ...valido, email }).email).toBeNull();
    }
  });

  it("el dígito de verificación y las observaciones son opcionales", () => {
    const r = terceroSchema.parse({ ...valido, digito_verificacion: undefined, observaciones: undefined });
    expect(r.digito_verificacion).toBeNull();
    expect(r.observaciones).toBeNull();
  });

  it("acepta el dígito como número y como texto, incluido el 0", () => {
    expect(terceroSchema.parse({ ...valido, digito_verificacion: 0 }).digito_verificacion).toBe(0);
    expect(terceroSchema.parse({ ...valido, digito_verificacion: "9" }).digito_verificacion).toBe(9);
  });

  it("un tercero puede tener un solo rol o los tres", () => {
    expect(terceroSchema.parse({ ...valido, roles: ["cliente_servicio"] }).roles).toEqual(["cliente_servicio"]);
    expect(
      terceroSchema.parse({ ...valido, roles: ["proveedor", "cliente", "cliente_servicio"] }).roles,
    ).toHaveLength(3);
  });

  it("quita roles repetidos", () => {
    expect(terceroSchema.parse({ ...valido, roles: ["cliente", "cliente"] }).roles).toEqual(["cliente"]);
  });

  it("es idempotente: lo ya normalizado vuelve a pasar igual (el Server Action re-valida)", () => {
    const una = terceroSchema.parse(valido);
    expect(terceroSchema.parse(una)).toEqual(una);
  });
});

describe("terceroSchema — casos inválidos", () => {
  it("exige nombre, identificación, dirección y teléfono", () => {
    expect(mensajes({ ...valido, nombre: "" })).toContain("El nombre debe tener al menos 2 caracteres");
    expect(mensajes({ ...valido, identificacion: "" })).toContain("La identificación es obligatoria");
    expect(mensajes({ ...valido, direccion: "   " })).toContain("La dirección es obligatoria");
    expect(mensajes({ ...valido, telefono: "" })).toContain("El teléfono es obligatorio");
  });

  it("una identificación de solo separadores cuenta como vacía", () => {
    expect(mensajes({ ...valido, identificacion: " . - " })).toContain("La identificación es obligatoria");
  });

  it("el nombre necesita al menos 2 caracteres (tras normalizar)", () => {
    expect(mensajes({ ...valido, nombre: "  A  " })).toContain("El nombre debe tener al menos 2 caracteres");
  });

  it("exige al menos un rol", () => {
    expect(mensajes({ ...valido, roles: [] })).toContain("Elige al menos un rol");
    expect(mensajes({ ...valido, roles: undefined })).toContain("Elige al menos un rol");
  });

  it("rechaza un rol fuera del catálogo", () => {
    expect(terceroSchema.safeParse({ ...valido, roles: ["vendedor"] }).success).toBe(false);
  });

  it("rechaza un tipo de identificación desconocido", () => {
    expect(mensajes({ ...valido, tipo_identificacion: "RUT" })).toContain("Elige el tipo de identificación");
  });

  it("rechaza un correo mal formado", () => {
    expect(mensajes({ ...valido, email: "no-es-un-correo" })).toContain("El correo no es válido");
    expect(mensajes({ ...valido, email: "a@b" })).toContain("El correo no es válido");
  });

  it("el dígito de verificación va de 0 a 9 y es entero", () => {
    expect(mensajes({ ...valido, digito_verificacion: 10 })).toContain("El dígito de verificación va de 0 a 9");
    expect(mensajes({ ...valido, digito_verificacion: -1 })).toContain("El dígito de verificación va de 0 a 9");
    expect(mensajes({ ...valido, digito_verificacion: "1.5" })).toContain(
      "El dígito de verificación debe ser un número entero",
    );
    expect(mensajes({ ...valido, digito_verificacion: "x" })).toContain("El dígito de verificación debe ser un número");
  });

  it("limita la longitud de los campos", () => {
    expect(mensajes({ ...valido, nombre: "a".repeat(151) })).toContain("El nombre: máximo 150 caracteres");
    expect(mensajes({ ...valido, observaciones: "a".repeat(501) })).toContain("Las observaciones: máximo 500 caracteres");
  });
});

describe("buscarSimilaresSchema", () => {
  it("normaliza nombre e identificación y admite criterios ausentes", () => {
    expect(buscarSimilaresSchema.parse({ nombre: "  Café   Pepe ", identificacion: "900.123.456-7" })).toEqual({
      nombre: "Café Pepe",
      identificacion: "9001234567",
    });
    expect(buscarSimilaresSchema.parse({})).toEqual({ nombre: "", identificacion: "" });
    expect(buscarSimilaresSchema.parse({ nombre: null, identificacion: null })).toEqual({ nombre: "", identificacion: "" });
  });
});
