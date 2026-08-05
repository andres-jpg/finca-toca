import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sincronizarEstadosAnimales } from "@/lib/animales/sincronizar-estados";

/**
 * Avance diario de los estados que corren solos con el calendario:
 * - productivo por edad: `leche` → `levante_1` (5 meses) → `levante_2` (+1,5 años);
 * - reproductivo: `pre_servicio` → `servicio` a los 60 días del parto/aborto.
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
    const { revisados, actualizados } = await sincronizarEstadosAnimales(supabase);

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
