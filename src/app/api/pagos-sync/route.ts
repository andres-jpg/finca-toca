import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, getCurrentUser } from "@/lib/auth/get-user-role";

interface PagoSyncItem {
  localId: number;
  serverId: number;
  nuevoEstado: "pagado" | "punto_venta" | "devuelto";
  responsable: "conductor" | "punto_venta" | "gerente";
  fechaMarcado: string | null;
}

export async function POST(request: Request) {
  const role = await getUserRole();
  if (role !== "cooperativa_user") {
    return new NextResponse("No autorizado", { status: 401 });
  }

  const user = await getCurrentUser();
  if (!user) return new NextResponse("No autorizado", { status: 401 });

  const supabase = await createClient();

  let items: PagoSyncItem[];
  try {
    items = await request.json();
    if (!Array.isArray(items) || items.length > 50) {
      return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const results: { localId: number }[] = [];
  const errors: { localId: number; error: string }[] = [];

  for (const item of items) {
    try {
      const { error } = await supabase
        .from("pagos_finca")
        .update({
          estado: item.nuevoEstado,
          responsable: item.responsable,
          fecha_marcado: item.fechaMarcado,
          marcado_por: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.serverId);

      if (error) throw new Error(error.message);
      results.push({ localId: item.localId });
    } catch (err) {
      errors.push({
        localId: item.localId,
        error: err instanceof Error ? err.message : "Error desconocido",
      });
    }
  }

  return NextResponse.json({ results, errors });
}
