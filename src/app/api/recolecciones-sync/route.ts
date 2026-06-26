import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/get-user-role";

const bodySchema = z
  .array(
    z.object({
      localId: z.number().int(),
      finca_id: z.number().int().positive(),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      litros: z.number().min(0).max(100000),
      precio_litro: z.number().nonnegative(),
    })
  )
  .min(1)
  .max(50);

export async function POST(req: NextRequest) {
  const role = await getUserRole();
  if (role !== "cooperativa_user" && role !== "cooperativa_admin") {
    return new NextResponse("No autorizado", { status: 401 });
  }

  let items: z.infer<typeof bodySchema>;
  try {
    const raw = await req.json();
    items = bodySchema.parse(raw);
  } catch {
    return new NextResponse("Cuerpo inválido", { status: 400 });
  }

  const supabase = await createClient();

  const results: { localId: number; serverId: number }[] = [];
  const errors: { localId: number; error: string }[] = [];

  for (const item of items) {
    // Upsert: crea o actualiza en conflicto de (finca_id, fecha)
    const { data, error } = await supabase
      .from("recolecciones")
      .upsert(
        {
          finca_id: item.finca_id,
          fecha: item.fecha,
          litros: item.litros,
          precio_litro: item.precio_litro,
        },
        { onConflict: "finca_id,fecha" }
      )
      .select("id")
      .single();

    if (error) {
      errors.push({ localId: item.localId, error: error.message });
      continue;
    }

    results.push({ localId: item.localId, serverId: data.id });
  }

  return NextResponse.json({ results, errors });
}
