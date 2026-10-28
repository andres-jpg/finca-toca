import type { Database } from "@/lib/supabase/database.types";
import type { RolTercero } from "./lib/roles";

/**
 * Fila de `public.terceros`. `roles` llega como `string[]` en los tipos generados; el CHECK de la tabla
 * garantiza que solo contiene valores de `RolTercero`.
 */
export type Tercero = Omit<Database["public"]["Tables"]["terceros"]["Row"], "roles"> & { roles: RolTercero[] };

/** Lo mínimo que necesita un selector: sin auditoría ni observaciones. */
export type TerceroOpcion = Pick<
  Tercero,
  "id" | "nombre" | "tipo_identificacion" | "identificacion" | "digito_verificacion" | "roles" | "es_consumidor_final" | "activo"
>;
