import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Fila de `cafe.remisiones` tal como la devuelve PostgREST (numeric → number, fechas → string).
 *
 * TODO(FIN-113): `src/lib/supabase/database.types.ts` aún no incluye `cafe.remisiones` (se regenera con
 * `pnpm db:types`, que necesita Docker; el CI falla por drift hasta entonces). Tras regenerarlos, borrar este
 * fichero y usar `createClient()` + `.schema("cafe").from("remisiones")` directamente: `RemisionRow` pasa a ser
 * `Database["cafe"]["Tables"]["remisiones"]["Row"]`.
 */
export interface RemisionRow {
  id: string;
  tenant_id: string;
  numero: string;
  lote_id: string;
  lote_codigo: string;
  fecha: string;
  tercero_id: string;
  cliente_nombre: string;
  cliente_identificacion: string | null;
  peso_recibido_kg: number;
  peso_entregado_kg: number;
  merma_total_kg: number | null;
  merma_total_pct: number | null;
  detalle: Json;
  valor_servicios: number;
  recibido_por: string | null;
  observaciones: string | null;
  forzada: boolean;
  anulada_at: string | null;
  anulada_por: string | null;
  motivo_anulacion: string | null;
  created_at: string;
  created_by: string | null;
}

type EsquemaRemisiones = {
  cafe: {
    Tables: {
      remisiones: {
        Row: RemisionRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};

export type ClienteRemisiones = SupabaseClient<EsquemaRemisiones, "cafe">;

/**
 * Cliente del servidor (sesión del usuario, el RLS aplica) tipado para `cafe.remisiones`. `createClient()` resuelve el
 * schema `public`: sin `.schema("cafe")` PostgREST responde PGRST205 (tabla inexistente) y la ficha del lote, el listado
 * y el tiquete se quedaban sin remisiones (lo destapó el test E2E del servicio completo, FIN-117).
 */
export async function createClienteRemisiones(): Promise<ClienteRemisiones> {
  return (await createClient()).schema("cafe") as unknown as ClienteRemisiones;
}
