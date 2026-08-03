import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sincronizarEstadosPorEdad } from "@/lib/animales/sincronizar-estados";

/**
 * Avance diario de los estados productivos que dependen solo de la edad:
 * `leche` → `levante_1` (5 meses) → `levante_2` (+1,5 años).
 *
 * No hay sesión de usuario en una invocación de cron, así que se autentica con
 * `CRON_SECRET` (lo envía Vercel Cron como Bearer) y se usa el cliente service-role.
 * El mismo cálculo está disponible a mano desde el botón "Recalcular estados".
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const { revisados, actualizados } = await sincronizarEstadosPorEdad(supabase);

    return NextResponse.json({
      ok: true,
      revisados,
      actualizados: actualizados.length,
      detalle: actualizados,
    });
  } catch (error) {
    console.error("[cron/animales-estados]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 500 }
    );
  }
}
