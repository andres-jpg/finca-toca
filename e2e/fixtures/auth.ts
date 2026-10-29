import path from "node:path";

// Usuarios de los tests y dónde se guarda su sesión. Los de café (`*@cafe.test`) los crea `supabase/dev/e2e-seed.sql`;
// el resto son los de `supabase/seed.sql` (contraseña de prueba común, solo local).

export const PASSWORD = "password123";

export const USUARIOS = {
  /** Cofradía (E2E) — rol `admin`: todo, incluidos maestros y correcciones. */
  cafeAdmin: { email: "admin@cafe.test", etiqueta: "Cofradía · administrador" },
  /** Cofradía (E2E) — rol `operativo`: recepción, planta, bodega y venta; sin maestros. */
  cafeOperativo: { email: "operativo@cafe.test", etiqueta: "Cofradía · operativo" },
  /** Cofradía (E2E) — rol `viewer` (Gerencia): consulta, panel y exportación. */
  cafeGerencia: { email: "gerencia@cafe.test", etiqueta: "Cofradía · gerencia" },
  /** Villa Blanca (ganadería, demo) — `admin`. */
  villaBlancaAdmin: { email: "admin@vb.test", etiqueta: "Villa Blanca · admin" },
  /** Toca Lácteos (cooperativa) — `cooperativa_admin`. */
  coopAdmin: { email: "coop.admin@test", etiqueta: "Cooperativa · admin" },
  /** Toca Lácteos — `cooperativa_user`: el conductor del itinerario 1. */
  coopConductor: { email: "coop.user@test", etiqueta: "Cooperativa · conductor" },
} as const;

export type RolE2E = keyof typeof USUARIOS;

export const ROLES = Object.keys(USUARIOS) as RolE2E[];

/** Fichero con la sesión (cookies) del rol, generado por `global-setup.ts`. */
export function estadoAutenticacion(rol: RolE2E): string {
  return path.join(__dirname, "..", ".auth", `${rol}.json`);
}

/** Slug del cliente de café de los tests (ver `supabase/dev/e2e-seed.sql`): da el prefijo del nombre de las exportaciones. */
export const SLUG_CAFE = "cafe-e2e";
