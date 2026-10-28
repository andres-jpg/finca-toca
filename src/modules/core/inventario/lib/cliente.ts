import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Articulo, MovimientoKardex, StockArticulo } from "../types";

/**
 * Esquema mínimo de lo que usa el inventario, escrito a mano para tipar las consultas mientras
 * `src/lib/supabase/database.types.ts` no incluya estos objetos.
 *
 * TODO(FIN-96): tras `pnpm db:types` (el CI falla por drift hasta que se regeneren los tipos), borrar
 * este fichero y usar `createClient()` directamente: `articulos`, `v_stock`, `v_kardex` y
 * `registrar_movimientos` ya vendrán tipados. Los tipos de dominio de `../types` se quedan.
 */
type EsquemaInventario = {
  public: {
    Tables: {
      articulos: {
        Row: Articulo;
        Insert: Partial<Omit<Articulo, "id" | "tenant_id">> & Pick<Articulo, "nombre" | "tipo">;
        Update: Partial<Pick<Articulo, "codigo" | "nombre" | "atributos" | "stock_minimo" | "activo">>;
        Relationships: [];
      };
    };
    Views: {
      v_stock: { Row: StockArticulo; Relationships: [] };
      v_kardex: { Row: MovimientoKardex; Relationships: [] };
    };
    Functions: Record<string, never>;
  };
}

export type ClienteInventario = SupabaseClient<EsquemaInventario>;

/** Cliente del servidor (sesión del usuario, RLS aplica) tipado para el inventario. */
export async function createClienteInventario(): Promise<ClienteInventario> {
  return (await createClient()) as unknown as ClienteInventario;
}
