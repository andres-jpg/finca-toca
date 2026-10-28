import type { Database } from "@/lib/supabase/database.types";

/** Fila de `cafe.tipos_cafe`. */
export type TipoCafe = Database["cafe"]["Tables"]["tipos_cafe"]["Row"];
