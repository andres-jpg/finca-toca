import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, getCurrentUser } from "@/lib/auth/get-user-role";

const ITINERARIO_SELECT =
  "id, nombre, itinerarios_fincas(finca_id, orden, fincas_cooperativa(id, nombre, precio_litro))";

export async function GET() {
  const role = await getUserRole();
  if (role !== "cooperativa_user") {
    return new NextResponse("No autorizado", { status: 401 });
  }

  const user = await getCurrentUser();
  if (!user) return new NextResponse("No autorizado", { status: 401 });

  const supabase = await createClient();

  // Obtener itinerario asignado
  const { data: userIt } = await supabase
    .from("user_itinerarios")
    .select("itinerario_id")
    .eq("user_id", user.id)
    .single();

  if (!userIt) {
    return NextResponse.json({ itinerario: null, syncedToday: [] });
  }

  const { data: itRow, error } = await supabase
    .from("itinerarios")
    .select(ITINERARIO_SELECT)
    .eq("id", userIt.itinerario_id)
    .single();

  if (error || !itRow) {
    return new NextResponse("Error cargando itinerario", { status: 500 });
  }

  const fincas = ((itRow.itinerarios_fincas as any[]) ?? [])
    .sort((a: any, b: any) => a.orden - b.orden)
    .map((iff: any) => {
      const f = Array.isArray(iff.fincas_cooperativa)
        ? iff.fincas_cooperativa[0]
        : iff.fincas_cooperativa;
      return {
        id: f?.id as number,
        nombre: (f?.nombre ?? "—") as string,
        precio_litro: Number(f?.precio_litro ?? 0),
        orden: iff.orden as number,
      };
    });

  const fincaIds = fincas.map((f) => f.id);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

  // Recolecciones ya registradas hoy en el servidor
  const { data: syncedRows } = fincaIds.length
    ? await supabase
        .from("recolecciones")
        .select("id, finca_id, litros, precio_litro")
        .in("finca_id", fincaIds)
        .eq("fecha", today)
    : { data: [] };

  const syncedToday = (syncedRows ?? []).map((r: any) => ({
    finca_id: r.finca_id as number,
    serverId: r.id as number,
    litros: Number(r.litros ?? 0),
    precio_litro: Number(r.precio_litro ?? 0),
    fecha: today,
  }));

  // Pagos pendientes con responsable=conductor para las fincas de este itinerario
  const { data: pagosRows } = fincaIds.length
    ? await supabase
        .from("pagos_finca")
        .select("id, finca_id, fecha_inicio, fecha_fin, estado, responsable")
        .in("finca_id", fincaIds)
        .eq("estado", "pendiente")
        .eq("responsable", "conductor")
    : { data: [] };

  const pagosActivos = (pagosRows ?? []).map((p: any) => ({
    id: p.id as number,
    finca_id: p.finca_id as number,
    fecha_inicio: p.fecha_inicio as string,
    fecha_fin: p.fecha_fin as string,
    estado: p.estado as string,
    responsable: p.responsable as string,
  }));

  return NextResponse.json(
    { itinerario: { id: itRow.id, nombre: itRow.nombre, fincas }, syncedToday, pagosActivos },
    { headers: { "Cache-Control": "no-store" } }
  );
}
