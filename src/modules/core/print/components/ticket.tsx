import type { ReactNode } from "react";

// Piezas de un tiquete térmico. Componentes de servidor sin estado: el layout `(print)` pone la tipografía y el
// ancho (ver `lib/css.ts`); aquí solo hay estructura. Todo el texto llega ya formateado (fechas en la zona del
// cliente, pesos con separadores): un tiquete se calibra mirando el papel, no se calcula en el navegador.

interface TicketHeaderProps {
  nombre: string;
  nit?: string | null;
  logoUrl?: string | null;
  /** Línea bajo el nombre: "REMISIÓN REM-2026-0001", "Comprobante de recepción"… */
  titulo?: string;
}

export function TicketHeader({ nombre, nit, logoUrl, titulo }: TicketHeaderProps) {
  return (
    <header className="text-center">
      {logoUrl ? (
        // Un <img> a propósito: el logo es una URL arbitraria del cliente y la impresora térmica es monocromo.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="mx-auto mb-1 max-h-14 max-w-full object-contain grayscale" />
      ) : null}
      <div className="text-[11pt] font-bold uppercase leading-tight">{nombre}</div>
      {nit ? <div>NIT {nit}</div> : null}
      {titulo ? <div className="mt-1 font-bold">{titulo}</div> : null}
    </header>
  );
}

interface TicketLineaProps {
  etiqueta: string;
  valor: ReactNode;
  /** Resalta la línea (totales). */
  fuerte?: boolean;
}

/** Etiqueta a la izquierda y valor a la derecha; si no caben en una línea, el valor baja alineado a la derecha. */
export function TicketLinea({ etiqueta, valor, fuerte }: TicketLineaProps) {
  return (
    <div className={`flex flex-wrap items-baseline justify-between gap-x-2 ${fuerte ? "font-bold" : ""}`}>
      <span>{etiqueta}</span>
      <span className="ml-auto text-right">{valor}</span>
    </div>
  );
}

export interface TicketColumna {
  header: string;
  /** Por defecto, `izquierda`; las cantidades van a la `derecha`. */
  alinear?: "izquierda" | "derecha" | "centro";
}

interface TicketTablaProps {
  columnas: TicketColumna[];
  filas: ReactNode[][];
}

// Las columnas de cifras no se parten (en 58 mm "$ 175.700" saldría en tres renglones por el `overflow-wrap`
// de la hoja); la de texto, a la izquierda, es la que cede el ancho y baja de renglón.
const ALINEACION = {
  izquierda: "text-left",
  derecha: "text-right whitespace-nowrap pl-1",
  centro: "text-center whitespace-nowrap pl-1",
} as const;

export function TicketTabla({ columnas, filas }: TicketTablaProps) {
  return (
    <table className="w-full border-collapse text-[9pt]">
      <thead>
        <tr className="border-b border-dashed border-black">
          {columnas.map((c) => (
            <th key={c.header} className={`py-0.5 font-bold ${ALINEACION[c.alinear ?? "izquierda"]}`}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((fila, i) => (
          <tr key={i} className="align-top">
            {fila.map((celda, j) => (
              <td key={j} className={`py-0.5 ${ALINEACION[columnas[j]?.alinear ?? "izquierda"]}`}>
                {celda}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TicketSeparador({ fuerte }: { fuerte?: boolean }) {
  return <hr className={`my-1.5 border-0 border-t border-black ${fuerte ? "border-solid" : "border-dashed"}`} />;
}

interface TicketPieProps {
  /** Fecha y hora de impresión ya formateadas (`formatearFechaHoraImpresion`). */
  impresoEn: string;
  /** Pone la línea de firma "Recibido". Por defecto sí. */
  firma?: boolean;
  /** Etiqueta bajo la línea de firma. */
  etiquetaFirma?: string;
  mensaje?: string;
}

export function TicketPie({ impresoEn, firma = true, etiquetaFirma = "Recibido por", mensaje }: TicketPieProps) {
  return (
    <footer className="text-center">
      {firma ? (
        <div className="mt-8">
          <div className="border-t border-black pt-0.5">{etiquetaFirma}</div>
        </div>
      ) : null}
      {mensaje ? <div className="mt-2">{mensaje}</div> : null}
      <div className="mt-2 text-[8pt]">Impreso: {impresoEn}</div>
    </footer>
  );
}

/** Un tiquete: termina con un salto de página (ver `.ticket` en `lib/css.ts`). */
export function Ticket({ children }: { children: ReactNode }) {
  return <section className="ticket">{children}</section>;
}

/** La copia del cliente: el mismo contenido tras un corte, marcado como copia. Va después del tiquete original. */
export function CopiaCliente({ children, numero }: { children: ReactNode; numero?: number }) {
  return (
    <section className="ticket">
      <div className="mb-1.5 border-y-2 border-black py-0.5 text-center text-[11pt] font-bold tracking-widest">
        COPIA CLIENTE{numero && numero > 1 ? ` ${numero}` : ""}
      </div>
      {children}
    </section>
  );
}

interface TicketCopiasProps {
  /** Tiquetes en total: el original y `copias - 1` copias del cliente (ver `parsearCopias`). */
  copias: number;
  children: ReactNode;
}

/** Repite `children`: primero el tiquete original y luego cada `CopiaCliente`, cada uno en su propio tiquete. */
export function TicketCopias({ copias, children }: TicketCopiasProps) {
  return (
    <>
      <Ticket>{children}</Ticket>
      {Array.from({ length: Math.max(0, copias - 1) }, (_, i) => (
        <CopiaCliente key={i} numero={i + 1}>
          {children}
        </CopiaCliente>
      ))}
    </>
  );
}
