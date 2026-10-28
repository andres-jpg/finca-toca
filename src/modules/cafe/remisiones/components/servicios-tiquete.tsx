import type { AnchoImpresora } from "@/modules/core/print/lib/ancho";
import { TicketLinea, TicketTabla } from "@/modules/core/print/components/ticket";
import { COLUMNAS_SERVICIOS, ENCABEZADO_APILADO, filasServicios, lineaApilada } from "../lib/tiquete";
import type { DetalleServicio } from "../types";

/**
 * Los servicios del tiquete. Rollo de 80 mm: la tabla del documento (Servicio, Entra kg, Sale kg, Merma). Rollo de
 * 58 mm: esa tabla no cabe (la columna de texto se parte letra por letra), así que cada servicio va apilado: el nombre
 * y, debajo, los kilos con la merma a la derecha. Componente de servidor; todo el texto llega ya formateado.
 */
export function ServiciosTiquete({ detalle, ancho }: { detalle: readonly DetalleServicio[]; ancho: AnchoImpresora }) {
  if (ancho === 58) {
    return (
      <div className="space-y-1">
        <div className="text-[8pt]">{ENCABEZADO_APILADO}</div>
        {detalle.map((d) => {
          const l = lineaApilada(d);
          if (l.cuerpo === null) return <TicketLinea key={d.servicio} etiqueta={l.titulo} valor={l.derecha} />;
          return (
            <div key={d.servicio}>
              <div>{l.titulo}</div>
              <TicketLinea etiqueta={l.cuerpo} valor={l.derecha} />
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <TicketTabla
      columnas={[
        { header: COLUMNAS_SERVICIOS[0] },
        { header: COLUMNAS_SERVICIOS[1], alinear: "derecha" },
        { header: COLUMNAS_SERVICIOS[2], alinear: "derecha" },
        { header: COLUMNAS_SERVICIOS[3], alinear: "derecha" },
      ]}
      filas={filasServicios(detalle).map((f) => [f.servicio, f.entra, f.sale, f.merma])}
    />
  );
}
