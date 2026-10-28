import { requireSesion } from "@/modules/core/auth/guards";
import { getParametro } from "@/modules/core/parametros/queries/parametros.queries";
import { EstiloTermico } from "@/modules/core/print/components/estilo-termico";
import { ImprimirButton } from "@/modules/core/print/components/imprimir-button";
import {
  TicketCopias,
  TicketHeader,
  TicketLinea,
  TicketPie,
  TicketSeparador,
  TicketTabla,
} from "@/modules/core/print/components/ticket";
import { parsearAncho } from "@/modules/core/print/lib/ancho";
import { formatearFechaHoraImpresion, parsearCopias } from "@/modules/core/print/lib/opciones";
import { PARAMETRO_IMPRESORA_ANCHO } from "@/modules/core/print/parametros";
import { formatearPesos } from "@/modules/core/tarifas/lib/formato";

interface PruebaPageProps {
  searchParams: Promise<{ ancho?: string | string[]; copias?: string | string[] }>;
}

// Datos ficticios para calibrar la impresora real: tres líneas con nombres largos para ver cómo parte el texto.
const LINEAS = [
  { concepto: "Café pergamino seco", kg: 125.5, valor: 1_400 },
  { concepto: "Café excelso tostado y molido, bolsa 500 g", kg: 20, valor: 2_200 },
  { concepto: "Cisco", kg: 8.25, valor: 0 },
];

/**
 * Tiquete de prueba para calibrar la impresora: `?ancho=58|80` fuerza un ancho distinto al del cliente y
 * `?copias=N` imprime N tiquetes (el original y N-1 "COPIA CLIENTE"; aquí, 2 por defecto). Datos ficticios.
 */
export default async function PruebaImpresionPage({ searchParams }: PruebaPageProps) {
  const { tenant } = await requireSesion();
  const { ancho: anchoParam, copias: copiasParam } = await searchParams;

  const anchoCliente = await getParametro(PARAMETRO_IMPRESORA_ANCHO);
  const ancho = parsearAncho(anchoParam) ?? anchoCliente;
  const copias = parsearCopias(copiasParam, 2);

  const total = LINEAS.reduce((s, l) => s + l.kg * l.valor, 0);
  const impresoEn = formatearFechaHoraImpresion(new Date(), tenant.zonaHoraria);

  return (
    <>
      {ancho !== anchoCliente ? <EstiloTermico ancho={ancho} /> : null}

      <div className="no-print mb-3 space-y-1 border-b border-dashed border-black pb-3 font-sans text-xs">
        <p>
          Vista de prueba · rollo de <strong>{ancho} mm</strong>
          {ancho !== anchoCliente ? ` (el del cliente es ${anchoCliente} mm)` : ""} · {copias} tiquete{copias === 1 ? "" : "s"}.
        </p>
        <p>
          <a className="underline" href="?ancho=80">80 mm</a> · <a className="underline" href="?ancho=58">58 mm</a> ·{" "}
          <a className="underline" href="?copias=1">solo original</a> · <a className="underline" href="?copias=2">con copia</a>
        </p>
        <ImprimirButton />
      </div>

      <TicketCopias copias={copias}>
        <TicketHeader nombre={tenant.nombre} nit="900.000.000-0" logoUrl={tenant.logoUrl} titulo="TIQUETE DE PRUEBA" />
        <TicketSeparador />
        <TicketLinea etiqueta="Número" valor="PRU-2026-0001" />
        <TicketLinea etiqueta="Fecha" valor={impresoEn} />
        <TicketLinea etiqueta="Tercero" valor="Cliente de ejemplo S.A.S." />
        <TicketSeparador />
        <TicketTabla
          columnas={[{ header: "Concepto" }, { header: "Kg", alinear: "derecha" }, { header: "Valor", alinear: "derecha" }]}
          filas={LINEAS.map((l) => [l.concepto, l.kg.toLocaleString("es-CO", { minimumFractionDigits: 2 }), formatearPesos(Math.round(l.kg * l.valor))])}
        />
        <TicketSeparador />
        <TicketLinea etiqueta="Total kg" valor={LINEAS.reduce((s, l) => s + l.kg, 0).toLocaleString("es-CO", { minimumFractionDigits: 2 })} />
        <TicketLinea etiqueta="TOTAL" valor={formatearPesos(Math.round(total))} fuerte />
        <TicketSeparador fuerte />
        <TicketPie impresoEn={impresoEn} mensaje="Datos ficticios: solo para calibrar" />
      </TicketCopias>
    </>
  );
}
