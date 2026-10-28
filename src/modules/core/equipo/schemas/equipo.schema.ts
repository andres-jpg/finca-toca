import { z } from "zod";
import { ROLES_EQUIPO } from "../lib/roles";

// `message` en vez de `required_error`/`invalid_type_error`: Zod 4 ya no los acepta. La base repite estas
// reglas (`invitar_miembro_tenant` valida el correo y el rol): esto solo da el mensaje antes.

const rol = z.enum(ROLES_EQUIPO, { message: "Elige el rol" });

export const invitarMiembroSchema = z.object({
  email: z
    .string({ message: "El correo es obligatorio" })
    .transform((v) => v.trim().toLowerCase())
    .pipe(z.string().min(1, "El correo es obligatorio").max(254, "El correo es demasiado largo").email("El correo no es válido")),
  rol,
});
export type InvitarMiembroInput = z.input<typeof invitarMiembroSchema>;

export const userIdSchema = z.string({ message: "Miembro no válido" }).uuid("Miembro no válido");

export const rolSchema = rol;
