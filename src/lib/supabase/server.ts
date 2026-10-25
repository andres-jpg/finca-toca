import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Cliente Supabase del servidor (cookies de la sesión). Por defecto resuelve el schema `public`.
 *
 * Las tablas del vertical de café viven en el schema `cafe`. No hay un segundo cliente:
 * se elige el schema por consulta con `.schema()`, igual para tablas y para RPC.
 *
 *   const supabase = await createClient();
 *   await supabase.schema("cafe").from("tabla").select("*");
 *   await supabase.schema("cafe").rpc("funcion", { arg: 1 });
 *
 * Requiere que `cafe` esté expuesto en la API (local: `[api] schemas` de supabase/config.toml;
 * staging/prod: Settings → API → Exposed schemas) y los tipos de `db:types` con `--schema public,cafe`.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[],
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll may fail in a read-only context (e.g. middleware calling from a Server Component)
          }
        },
      },
    },
  );
}
