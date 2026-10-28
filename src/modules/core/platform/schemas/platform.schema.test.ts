import { describe, expect, it } from "vitest";
import {
  actualizarTenantSchema,
  agregarMiembroSchema,
  crearTenantSchema,
  slugSchema,
} from "./platform.schema";

describe("slugSchema", () => {
  it.each(["cofradia", "villa-blanca", "abc", "a1-b2", "x".repeat(40)])("acepta %s", (slug) => {
    expect(slugSchema.safeParse(slug).success).toBe(true);
  });

  it.each(["ab", "Cofradia", "con_guion_bajo", "con espacio", "x".repeat(41), "tílde", ""])(
    "rechaza «%s»",
    (slug) => {
      expect(slugSchema.safeParse(slug).success).toBe(false);
    },
  );
});

describe("crearTenantSchema", () => {
  it("normaliza el nombre y vacía los opcionales", () => {
    const r = crearTenantSchema.parse({ nombre: "  Cofradía   SAS ", slug: "cofradia", vertical: "cafe", nit: " ", plan: "" });
    expect(r.nombre).toBe("Cofradía SAS");
    expect(r.nit).toBeNull();
    expect(r.plan).toBeNull();
    expect(r.modulos).toEqual([]);
  });

  it("rechaza un vertical desconocido y un nombre vacío", () => {
    expect(crearTenantSchema.safeParse({ nombre: "X Co", slug: "x-co", vertical: "vino" }).success).toBe(false);
    expect(crearTenantSchema.safeParse({ nombre: " ", slug: "x-co", vertical: "cafe" }).success).toBe(false);
  });
});

describe("actualizarTenantSchema", () => {
  const base = { nombre: "Cofradía", estado: "activo", plan: "pro" } as const;

  it("deja a null el logo y el color vacíos", () => {
    const r = actualizarTenantSchema.parse({ ...base, logo_url: "", color_primario: "", nit: "" });
    expect(r).toMatchObject({ logo_url: null, color_primario: null, nit: null });
  });

  it("valida el color hexadecimal y la URL del logo", () => {
    expect(actualizarTenantSchema.safeParse({ ...base, color_primario: "#1A7F5A" }).success).toBe(true);
    expect(actualizarTenantSchema.safeParse({ ...base, color_primario: "rojo" }).success).toBe(false);
    expect(actualizarTenantSchema.safeParse({ ...base, logo_url: "no es url" }).success).toBe(false);
    expect(actualizarTenantSchema.safeParse({ ...base, logo_url: "https://example.com/logo.png" }).success).toBe(true);
  });

  it("rechaza un estado fuera del enum", () => {
    expect(actualizarTenantSchema.safeParse({ ...base, estado: "eliminado" }).success).toBe(false);
  });
});

describe("agregarMiembroSchema", () => {
  it("pasa el email a minúsculas sin espacios", () => {
    expect(agregarMiembroSchema.parse({ email: "  Persona@Empresa.COM ", rol: "owner" }).email).toBe("persona@empresa.com");
  });

  it("rechaza un email inválido y un rol desconocido", () => {
    expect(agregarMiembroSchema.safeParse({ email: "persona", rol: "owner" }).success).toBe(false);
    expect(agregarMiembroSchema.safeParse({ email: "a@b.co", rol: "dios" }).success).toBe(false);
  });
});
