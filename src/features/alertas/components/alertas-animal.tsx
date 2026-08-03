import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { AlertaItem } from "@/features/alertas/components/alerta-item";
import type { Alerta } from "@/types";

interface AlertasAnimalProps {
  alertas: Alerta[];
  /** La vaca está cargada pero no hay evento de inseminación/monta del que partir. */
  faltaServicio: boolean;
  canEdit: boolean;
}

export function AlertasAnimal({ alertas, faltaServicio, canEdit }: AlertasAnimalProps) {
  if (faltaServicio) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2.5">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800">
            Falta registrar la inseminación
          </p>
          <p className="text-xs text-amber-700 mt-0.5">
            La vaca está marcada como cargada, pero sin un evento de inseminación o monta
            no hay fecha desde la que calcular el secado (7 meses) ni el parto probable
            (9 meses). Regístralo abajo con la fecha real del servicio.
          </p>
        </div>
      </div>
    );
  }

  if (alertas.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 flex items-center gap-2 text-gray-400">
        <CheckCircle2 className="h-4 w-4" />
        <span className="text-sm">Sin alertas pendientes.</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100 px-4">
      {alertas.map((alerta) => (
        <AlertaItem
          key={alerta.id}
          alerta={alerta}
          mostrarAnimal={false}
          canEdit={canEdit}
        />
      ))}
    </div>
  );
}
