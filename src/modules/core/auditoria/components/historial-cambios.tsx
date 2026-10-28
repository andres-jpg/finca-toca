import { cn } from "@/lib/utils";
import type { CambioAuditado } from "../actions/historial.actions";
import { ETIQUETA_ACCION, formatearFechaHora, resumirCambios } from "../lib/formato-cambios";

interface HistorialCambiosProps {
  cambios: CambioAuditado[];
  className?: string;
}

/**
 * Lista de cambios de un registro: fecha, quién, qué hizo y qué campos tocó. Presentacional:
 * recibe lo que devuelve `getHistorialCambios()`. Todavía no está en ninguna pantalla (Fase 1).
 */
export function HistorialCambios({ cambios, className }: HistorialCambiosProps) {
  if (cambios.length === 0) {
    return <p className={cn("text-sm text-muted-foreground", className)}>Sin cambios registrados.</p>;
  }

  return (
    <ol className={cn("space-y-3", className)}>
      {cambios.map((cambio) => {
        const campos = resumirCambios(cambio.accion, cambio.cambios);
        return (
          <li key={cambio.id} className="rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="font-medium">
                {ETIQUETA_ACCION[cambio.accion]} · {cambio.email ?? "Sistema"}
              </span>
              <time dateTime={cambio.at} className="text-xs text-muted-foreground">
                {formatearFechaHora(cambio.at)}
              </time>
            </div>
            {campos.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                {campos.map((campo) => (
                  <li key={campo}>{campo}</li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
