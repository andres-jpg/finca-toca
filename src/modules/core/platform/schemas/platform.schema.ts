import { z } from "zod";
import { ESTADOS_TENANT, ROLES_MIEMBRO, VERTICALES } from "../lib/nucleo";

// `message` en vez de `required_error`/`invalid_type_error`: Zod 4 ya no los acepta. La base repite estas
// reglas (`platform.crear_tenant()` valida el slug, el nombre y los módulos): esto solo da el mensaje antes.

const texto = (obligatorio: string, max: number) =>
  z
    .string({ message: obligatorio })
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(2, obligatorio).max(max, `Máximo ${max} caracteres`));

/** Texto opcional: vacío → `null`. */
const textoOpcional = (max: number) =>
  z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().max(max, `Máximo ${max} caracteres`))
    .transform((v) => (v === "" ? null : v))
    .nullish()
    .transform((v) => v ?? null);

export const slugSchema = z
  .string({ message: "El identificador es obligatorio" })
  .transform((v) => v.trim())
  .pipe(
    z.string().regex(/^[a-z0-9-]{3,40}$/, "De 3 a 40 caracteres: minúsculas, números y guiones"),
  );

export const crearTenantSchema = z.object({
  nombre: texto("El nombre es obligatorio", 120),
  slug: slugSchema,
  vertical: z.enum(VERTICALES, { message: "Elige el vertical" }),
  nit: textoOpcional(30),
  plan: textoOpcional(40),
  /** Módulos opcionales además de los base del vertical. */
  modulos: z.array(z.string().min(1)).default([]),
});
export type CrearTenantInput = z.input<typeof crearTenantSchema>;
export type CrearTenantDatos = z.output<typeof crearTenantSchema>;

export const actualizarTenantSchema = z.object({
  nombre: texto("El nombre es obligatorio", 120),
  estado: z.enum(ESTADOS_TENANT, { message: "Elige el estado" }),
  plan: texto("El plan es obligatorio", 40),
  nit: textoOpcional(30),
  logo_url: textoOpcional(500).pipe(
    z
      .string()
      .url("La URL del logo no es válida")
      .nullable(),
  ),
  color_primario: textoOpcional(7).pipe(
    z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "El color debe ser hexadecimal, p. ej. #1A7F5A")
      .nullable(),
  ),
});
export type ActualizarTenantInput = z.input<typeof actualizarTenantSchema>;
export type ActualizarTenantDatos = z.output<typeof actualizarTenantSchema>;

export const agregarMiembroSchema = z.object({
  email: z
    .string({ message: "El email es obligatorio" })
    .transform((v) => v.trim().toLowerCase())
    .pipe(z.string().email("El email no es válido")),
  rol: z.enum(ROLES_MIEMBRO, { message: "Elige el rol" }),
});
export type AgregarMiembroInput = z.input<typeof agregarMiembroSchema>;

export const tenantIdSchema = z.uuid({ message: "Cliente no válido." });
