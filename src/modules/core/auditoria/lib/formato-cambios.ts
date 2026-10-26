import type { Json } from "@/lib/supabase/database.types";

export type AccionAuditoria = "INSERT" | "UPDATE" | "DELETE";

export const ETIQUETA_ACCION: Record<AccionAuditoria, string> = {
  INSERT: "Creó",
  UPDATE: "Editó",
  DELETE: "Eliminó",
};

const MAX_VALOR = 60;

/** Un valor del log en texto corto: strings tal cual, null como «—», el resto en JSON. */
export function formatearValor(valor: Json | undefined): string {
  if (valor === null || valor === undefined) return "—";
  const texto = typeof valor === "string" ? valor : JSON.stringify(valor);
  return texto.length > MAX_VALOR ? `${texto.slice(0, MAX_VALOR - 1)}…` : texto;
}

/**
 * Campos modificados de un UPDATE como líneas «campo → valor nuevo». INSERT y DELETE no listan
 * campos (la acción ya lo dice). `cambios` solo trae las claves que cambiaron, ya filtradas en la base.
 */
export function resumirCambios(accion: AccionAuditoria, cambios: Json | null): string[] {
  if (accion !== "UPDATE" || cambios === null || typeof cambios !== "object" || Array.isArray(cambios)) {
    return [];
  }
  return Object.entries(cambios).map(([campo, valor]) => `${campo.replaceAll("_", " ")} → ${formatearValor(valor)}`);
}

/**
 * Fecha y hora fijas en la zona de la finca (Colombia, UTC-5). Se formatea con zona explícita porque
 * el componente se renderiza en el servidor (UTC en Vercel) y el navegador está en la zona local.
 */
export function formatearFechaHora(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date(iso));
}
