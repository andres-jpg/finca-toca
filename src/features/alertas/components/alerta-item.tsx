"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { resolverAlerta } from "@/features/alertas/actions/alertas.actions";
import { ALERTA_CONFIG, textoPlazo } from "@/features/alertas/components/alerta-config";
import type { Alerta } from "@/types";

interface AlertaItemProps {
  alerta: Alerta;
  /** `false` en la ficha del animal, donde el nombre ya está en el encabezado. */
  mostrarAnimal?: boolean;
  /** `false` para roles de solo lectura: oculta "Marcar hecho". */
  canEdit?: boolean;
  onResuelta?: () => void;
}

export function AlertaItem({
  alerta,
  mostrarAnimal = true,
  canEdit = false,
  onResuelta,
}: AlertaItemProps) {
  const config = ALERTA_CONFIG[alerta.tipo];
  const Icon = config.icon;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [resuelta, setResuelta] = useState(false);

  const handleResolver = () => {
    startTransition(async () => {
      try {
        await resolverAlerta(alerta.animal_id, alerta.tipo as "secado" | "topizado");
        setResuelta(true);
        toast.success(`${config.label} registrado para ${alerta.animal_nombre}`);
        onResuelta?.();
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "No se pudo registrar la acción"
        );
      }
    });
  };

  if (resuelta) return null;

  return (
    <div className="flex items-start gap-3 py-2.5">
      <div
        className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: config.bg }}
      >
        <Icon className="h-4 w-4" style={{ color: config.color }} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-medium text-stone-800">{config.label}</span>
          <span
            className={cn(
              "text-xs font-medium",
              alerta.severidad === "vencida"
                ? "text-red-600"
                : alerta.severidad === "hoy"
                  ? "text-amber-600"
                  : "text-stone-400"
            )}
          >
            {textoPlazo(alerta)}
          </span>
        </div>

        {mostrarAnimal && (
          <Link
            href={`/dashboard/animales/${alerta.animal_id}`}
            className="text-sm text-stone-600 hover:text-blue-600 hover:underline transition-colors"
          >
            {alerta.animal_nombre}{" "}
            <span className="font-mono text-xs text-stone-400">
              #{alerta.animal_identificador}
            </span>
          </Link>
        )}

        <p className="text-xs text-stone-400 mt-0.5">
          {alerta.fecha_objetivo.split("-").reverse().join("/")} · {alerta.detalle}
        </p>
      </div>

      {alerta.resoluble && canEdit && (
        <button
          type="button"
          onClick={handleResolver}
          disabled={pending}
          title="Registrar como hecho"
          className="shrink-0 flex items-center gap-1 rounded-md border border-stone-200 px-2 py-1 text-xs font-medium text-stone-600 hover:border-green-400 hover:text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Hecho
        </button>
      )}
    </div>
  );
}
