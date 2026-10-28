import { AlertTriangle, Droplets } from "lucide-react";
import { ETIQUETA_ALERTA_CALIDAD } from "@/modules/cafe/recepciones/lib/calidad";

/** «Humedad alta, Densidad baja»; una clave desconocida se muestra tal cual. */
export function textoAlertasCalidad(alertas: readonly string[]): string {
  const etiquetas = ETIQUETA_ALERTA_CALIDAD as Readonly<Record<string, string>>;
  return alertas.map((a) => etiquetas[a] ?? a).join(", ");
}

/**
 * Iconos de alerta del listado: calidad del pergamino fuera de rango y merma desviada. Cada uno lleva su texto
 * (`title` para el puntero, `sr-only` para lectores y tabletas sin hover).
 */
export function AlertasLote({ alertasCalidad, tieneDesvio }: { alertasCalidad: readonly string[]; tieneDesvio: boolean }) {
  if (alertasCalidad.length === 0 && !tieneDesvio) return <span className="text-gray-300">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      {alertasCalidad.length > 0 && (
        <span title={`Calidad: ${textoAlertasCalidad(alertasCalidad)}`} className="inline-flex items-center gap-1 text-sky-700">
          <Droplets className="h-4 w-4" aria-hidden />
          <span className="sr-only">Alerta de calidad: {textoAlertasCalidad(alertasCalidad)}</span>
        </span>
      )}
      {tieneDesvio && (
        <span title="Merma desviada de la referencia" className="inline-flex items-center gap-1 text-amber-600">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <span className="sr-only">Merma desviada de la referencia</span>
        </span>
      )}
    </span>
  );
}
