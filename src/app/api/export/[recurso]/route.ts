import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
// Los exportadores de cada módulo se registran al cargar el registro (`defineExportadores` en ese fichero).
import "@/modules/registry";
import { getSesion } from "@/modules/core/auth/sesion";
import { generarExcel } from "@/modules/core/export/generar-excel";
import { nombreArchivoExport } from "@/modules/core/export/lib/nombre-archivo";
import { ExportError } from "@/modules/core/export/lib/paginar";
import { autorizarExport, getExportador } from "@/modules/core/export/registry";
import { respuestaExcel } from "@/modules/core/export/respuesta";
import { AuthorizationError } from "@/lib/auth/errors";

// ExcelJS necesita Node (no Edge), y la respuesta depende de la sesión y de los filtros: nada de caché.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const error = (status: number, codigo: string, mensaje: string) =>
  NextResponse.json({ error: codigo, message: mensaje }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * `GET /api/export/<recurso>?...filtros` → `.xlsx` del recurso registrado con `defineExportadores()`.
 * Recibe los mismos parámetros de consulta que la pantalla para respetar sus filtros. Se autoriza aquí
 * (sesión, módulo activo y rol) y, debajo, RLS aísla las filas por cliente.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ recurso: string }> }) {
  const { recurso } = await params;

  const sesion = await getSesion();
  // Sesión antes que 404: no se revela qué recursos existen a quien no ha iniciado sesión.
  if (!sesion) return error(401, "no_autorizado", "Inicia sesión para exportar.");

  const exportador = getExportador(recurso);
  if (!exportador) return error(404, "recurso_no_encontrado", "Ese recurso no se puede exportar.");

  const decision = autorizarExport(sesion, exportador);
  if (decision === "sin_modulo") return error(403, "modulo_no_activo", "Tu cliente no tiene activo este módulo.");
  if (decision !== "ok") return error(403, "no_autorizado", "No tienes permiso para exportar esto.");

  try {
    const resultado = await exportador.generar({ sesion, filtros: request.nextUrl.searchParams });
    const buffer = await generarExcel(resultado.hojas, {
      tenant: { nombre: sesion.tenant.nombre, zonaHoraria: sesion.tenant.zonaHoraria },
      filtrosAplicados: resultado.filtrosAplicados,
    });
    return respuestaExcel(
      buffer,
      nombreArchivoExport({ slug: sesion.tenant.slug, recurso, desde: resultado.desde, hasta: resultado.hasta }),
    );
  } catch (e) {
    if (e instanceof AuthorizationError) return error(403, "no_autorizado", "No tienes permiso para exportar esto.");
    if (e instanceof ExportError && e.codigo === "export_demasiado_grande") {
      return error(413, e.codigo, "Hay demasiados datos para un solo archivo: acota los filtros.");
    }
    Sentry.captureException(e, { tags: { exportacion: recurso } });
    return error(500, "export_fallido", "No se pudo generar el archivo.");
  }
}
