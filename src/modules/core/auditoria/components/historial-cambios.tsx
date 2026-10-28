import { cn } from "@/lib/utils";
import type { CambioAuditado } from "../actions/historial.actions";
import { ETIQUETA_ACCION, formatearFechaHora, resumirCambios } from "../lib/formato-cambios";

interface HistorialCambiosProps {
  cambios: CambioAuditado[];
  className?: string;
  /** De qué registro habla un cambio («Miembro: ana@…»); por defecto no se muestra. */
  etiquetaRegistro?: (cambio: CambioAuditado) => string | undefined;
  /** Líneas de detalle de un cambio; por defecto `resumirCambios()` (campo → valor nuevo). */
  resumir?: (cambio: CambioAuditado) => string[];
}

/**
 * Lista de cambios de un registro: fecha, quién, qué hizo y qué campos tocó. Presentacional:
 * recibe lo que devuelve `getHistorialCambios()`. Lo usa la pantalla de equipo (`tenant_members`).
 */
export function HistorialCambios({ cambios, className, etiquetaRegistro, resumir }: HistorialCambiosProps) {
  if (cambios.length === 0) {
    return <p className={cn("text-sm text-muted-foreground", className)}>Sin cambios registrados.</p>;
  }

  return (
    <ol className={cn("space-y-3", className)}>
      {cambios.map((cambio) => {
        const campos = resumir ? resumir(cambio) : resumirCambios(cambio.accion, cambio.cambios);
        const registro = etiquetaRegistro?.(cambio);
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
            {registro && <p className="mt-1 text-xs text-muted-foreground">{registro}</p>}
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
