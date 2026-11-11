import { TicketLinea } from "@/modules/core/print/components/ticket";
import { bloquesServicios } from "../lib/tiquete";
import type { DetalleServicio } from "../types";

/**
 * Los servicios del tiquete (B-17), apilados: el nombre del servicio y, debajo, sus líneas (etiqueta a la izquierda,
 * valor a la derecha). Sirve igual para el rollo de 80 mm y el de 58 mm. Sin merma de molienda ni de empaque.
 * Componente de servidor; todo el texto llega ya formateado.
 */
export function ServiciosTiquete({ detalle, perfil }: { detalle: readonly DetalleServicio[]; perfil: string | null }) {
  return (
    <div className="space-y-1">
      {bloquesServicios(detalle, perfil).map((b) => (
        <div key={b.titulo}>
          <div className="font-bold">{b.titulo}</div>
          {b.lineas.map((l) => (
            <TicketLinea key={l.etiqueta} etiqueta={l.etiqueta} valor={l.valor} />
          ))}
        </div>
      ))}
    </div>
  );
}
