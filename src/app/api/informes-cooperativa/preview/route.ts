import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/get-user-role";
import {
  buildInformeData,
  resolveInformePeriodo,
  informeQuerySchema,
  InformeDataError,
} from "@/lib/cooperativa/informe-data";

// Mismos datos que /api/informes-cooperativa (Excel), en JSON, para previsualizar
// en pantalla sin descargar el archivo. No cubre comprobantes de pago.
export async function GET(req: NextRequest) {
  const role = await getUserRole();
  if (!role || !["cooperativa_admin"].includes(role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const parsed = informeQuerySchema.safeParse({
    tipo: searchParams.get("tipo"),
    id: searchParams.get("id") ?? undefined,
    quincena: searchParams.get("quincena") ?? undefined,
    mes: searchParams.get("mes") ?? undefined,
    anio: searchParams.get("anio") ?? undefined,
    fechaDesde: searchParams.get("fechaDesde") ?? undefined,
    fechaHasta: searchParams.get("fechaHasta") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  }

  const { tipo, id, quincena, mes, anio, fechaDesde, fechaHasta } = parsed.data;
  const periodo = resolveInformePeriodo({ quincena, mes, anio, fechaDesde, fechaHasta });
  const supabase = await createClient();

  try {
    const informe = await buildInformeData(supabase, tipo, id, periodo);
    return NextResponse.json(informe);
  } catch (err) {
    if (err instanceof InformeDataError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
