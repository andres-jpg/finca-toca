import { Baby, Flame, Milk, Scissors, Syringe } from "lucide-react";
import type { Alerta, SeveridadAlerta, TipoAlerta } from "@/types";

export const ALERTA_CONFIG: Record<
  TipoAlerta,
  { label: string; icon: React.ElementType; color: string; bg: string }
> = {
  parto: { label: "Parto probable", icon: Baby, color: "#e11d48", bg: "#fff1f2" },
  secado: { label: "Pasar a secado", icon: Milk, color: "#d97706", bg: "#fffbeb" },
  topizado: { label: "Topizado", icon: Scissors, color: "#7c3aed", bg: "#f5f3ff" },
  celo: { label: "Celo", icon: Flame, color: "#ea580c", bg: "#fff7ed" },
  revacunacion: { label: "Revacunación", icon: Syringe, color: "#2563eb", bg: "#eff6ff" },
};

export const SEVERIDAD_CLASSES: Record<SeveridadAlerta, string> = {
  vencida: "bg-red-50 text-red-700 border-red-200",
  hoy: "bg-amber-50 text-amber-700 border-amber-200",
  proxima: "bg-stone-50 text-stone-600 border-stone-200",
};

export const SEVERIDAD_LABELS: Record<SeveridadAlerta, string> = {
  vencida: "Vencidas",
  hoy: "Hoy",
  proxima: "Próximos días",
};

/** "Vencida hace 3 días" · "Hoy" · "En 5 días" */
export function textoPlazo(alerta: Alerta): string {
  const dias = alerta.dias_restantes;
  if (dias === 0) return "Hoy";
  if (dias < 0) {
    const n = Math.abs(dias);
    return n === 1 ? "Vencida ayer" : `Vencida hace ${n} días`;
  }
  return dias === 1 ? "Mañana" : `En ${dias} días`;
}

/** Agrupa manteniendo el orden vencidas → hoy → próximas. */
export function agruparPorSeveridad(alertas: Alerta[]) {
  const grupos: { severidad: SeveridadAlerta; alertas: Alerta[] }[] = [
    { severidad: "vencida", alertas: [] },
    { severidad: "hoy", alertas: [] },
    { severidad: "proxima", alertas: [] },
  ];
  for (const alerta of alertas) {
    grupos.find((g) => g.severidad === alerta.severidad)!.alertas.push(alerta);
  }
  return grupos.filter((g) => g.alertas.length > 0);
}
