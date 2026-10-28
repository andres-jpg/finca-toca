"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRolTenant } from "@/modules/core/auth/guards";
import type { RolTenant } from "@/modules/core/auth/sesion";
import { traducirErrorRpc, type Result } from "@/modules/core/rpc/call-rpc";
import { mensajeRpc } from "@/modules/core/rpc/mensajes";
import { requireModulo } from "@/modules/core/tenants/tenant.guards";

// Server Actions de la ficha del lote (FIN-110). Endpoints POST públicos: módulo activo → rol de la membresía →
// Zod → escritura. La frontera real es el RLS de `cafe.lotes` (UPDATE solo `owner`/`admin`) y el trigger
// `lotes_proteger` (que rechaza anular un lote con procesos); esto es defensa en profundidad.

/** Anular un lote es una corrección: igual que el RLS, solo `owner`/`admin`. */
const ROLES_ANULAR: RolTenant[] = ["owner", "admin"];

const anularSchema = z.object({
  loteId: z.uuid({ message: "El lote no es válido." }),
  motivo: z
    .string()
    .trim()
    .min(3, "Escribe el motivo de la anulación.")
    .max(500, "El motivo es demasiado largo (máximo 500 caracteres)."),
});

/**
 * Anula un lote que no tiene procesos (si los tiene, el trigger responde `lote_con_procesos` y hay que anular primero
 * los procesos). Quién y cuándo anula lo fija la base. Un lote anulado no se vuelve a tocar.
 */
export async function anularLote(input: { loteId: string; motivo: string }): Promise<Result<{ id: string }>> {
  await requireModulo("cafe.recepcion");
  await requireRolTenant(ROLES_ANULAR);

  const parsed = anularSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "datos_invalidos", message: parsed.error.issues[0]?.message ?? mensajeRpc("datos_invalidos") };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("cafe")
    .from("lotes")
    // `anulado_at` lo reescribe el trigger con `now()`: aquí solo marca la intención de anular.
    .update({ anulado_at: new Date().toISOString(), motivo_anulacion: parsed.data.motivo })
    .eq("id", parsed.data.loteId)
    .select("id")
    .maybeSingle();
  if (error) return traducirErrorRpc("cafe", "lotes", error);
  // Sin fila: el lote no existe o el RLS lo esconde (es de otro cliente).
  if (!data) return { ok: false, code: "lote_no_encontrado", message: mensajeRpc("lote_no_encontrado") };

  revalidatePath("/dashboard/cafe/lotes");
  revalidatePath(`/dashboard/cafe/lotes/${data.id}`);
  return { ok: true, data: { id: data.id } };
}
