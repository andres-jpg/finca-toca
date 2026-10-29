import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSesion } from "@/modules/core/auth/guards";
import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";
import { formatearCOP } from "@/modules/cafe/compras/lib/compra";
import { enteroConMiles } from "@/modules/cafe/empaque/lib/empaque";
import { fechaCorta, fechaHoraZona } from "@/modules/cafe/lotes/lib/formato";
import { AnularVentaButton } from "@/modules/cafe/ventas/components/anular-venta-button";
import { CompletarFacturaForm } from "@/modules/cafe/ventas/components/completar-factura-form";
import { InsigniaEstadoVenta, InsigniaTipoVenta, TextoFactura } from "@/modules/cafe/ventas/components/insignias";
import { enteroSigno, etiquetaMotivoVenta } from "@/modules/cafe/ventas/lib/venta";
import { getVenta } from "@/modules/cafe/ventas/queries/ventas.queries";

/**
 * Detalle de una venta o cortesía: cliente, líneas con su precio de ese momento, los movimientos de inventario que
 * generó (y la devolución si se anuló), el estado de la factura de Aliados y, para owner/admin, anular. Completar el
 * número de factura lo hace owner/admin/operativo. Los precios son un snapshot: no cambian si cambia la lista.
 */
export default async function VentaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  await requireModuloPagina("cafe.ventas");
  const { rolTenant, tenant } = await requireSesion();
  const { id } = await params;
  const venta = await getVenta(id);
  if (!venta) notFound();

  const anulada = venta.estado === "anulada";
  const puedeAnular = (rolTenant === "owner" || rolTenant === "admin") && !anulada;
  const puedeCompletarFactura = rolTenant !== "viewer" && !anulada && venta.requiereFactura;
  const nombre = venta.tipo === "cortesia" ? "Cortesía" : "Venta";

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link href="/dashboard/cafe/ventas" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 sm:min-h-0">
          <ArrowLeft className="h-4 w-4" />
          Ventas
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-gray-800 tabular-nums">
            {nombre} {venta.numero}
          </h1>
          <InsigniaTipoVenta tipo={venta.tipo} />
          <InsigniaEstadoVenta estado={venta.estado} />
        </div>
      </div>

      {anulada && venta.anulacion && (
        <p role="status" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Anulada el {fechaHoraZona(venta.anulacion.en, tenant.zonaHoraria)}. Motivo: {venta.anulacion.motivo}. El inventario se repuso.
        </p>
      )}

      <section className="grid gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <Dato titulo="Cliente" valor={venta.esConsumidorFinal ? "Consumidor final" : venta.clienteNombre} />
        <Dato titulo="Fecha" valor={fechaCorta(venta.fecha)} />
        <Dato titulo="Registrada" valor={fechaHoraZona(venta.creadoEn, tenant.zonaHoraria)} />
        <Dato titulo={venta.tipo === "cortesia" ? "Valor" : "Total"} valor={venta.tipo === "cortesia" ? "Sin valor" : formatearCOP(venta.total)} fuerte />
        {venta.observaciones && (
          <div className="sm:col-span-2 lg:col-span-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Observaciones</p>
            <p className="mt-0.5 whitespace-pre-line text-sm text-gray-800">{venta.observaciones}</p>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-gray-800">Productos</h2>
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Precio unitario</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {venta.lineas.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.producto}</TableCell>
                  <TableCell className="text-right tabular-nums">{enteroConMiles(l.cantidad)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatearCOP(l.precioUnitario)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatearCOP(l.subtotal)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={3} className="text-right font-semibold">
                  {venta.tipo === "cortesia" ? "Valor de la cortesía" : "Total"}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatearCOP(venta.total)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </section>

      {venta.tipo === "venta" && (
        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold text-gray-800">Factura electrónica (Aliados)</h2>
            <TextoFactura estado={venta.facturaEstado} numero={venta.numeroFactura} anulada={anulada} />
          </div>
          {!venta.requiereFactura && <p className="text-sm text-gray-500">Esta venta no requiere factura electrónica.</p>}
          {venta.requiereFactura && venta.facturaEstado === "pendiente" && !anulada && (
            <p className="text-sm text-amber-800">Falta el número: complétalo cuando la factura esté emitida en Aliados.</p>
          )}
          {puedeCompletarFactura && <CompletarFacturaForm ventaId={venta.id} numeroActual={venta.numeroFactura} />}
          <p className="text-xs text-gray-500">Este registro no emite factura electrónica; la factura se emite en Aliados.</p>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-gray-800">Movimientos de inventario</h2>
        {venta.movimientos.length === 0 ? (
          <p className="text-sm text-gray-500">Sin movimientos.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {venta.movimientos.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="tabular-nums">{fechaHoraZona(m.fecha, tenant.zonaHoraria)}</TableCell>
                    <TableCell>{m.producto}</TableCell>
                    <TableCell>{etiquetaMotivoVenta(m.motivo)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${m.cantidad < 0 ? "text-red-700" : "text-green-700"}`}>{enteroSigno(m.cantidad)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="text-xs text-gray-500">
          El kardex de cada producto está en{" "}
          <Link href="/dashboard/cafe/inventario" className="text-sky-700 underline underline-offset-2">
            Producto terminado
          </Link>
          .
        </p>
      </section>

      {puedeAnular && (
        <div className="flex justify-end">
          <AnularVentaButton ventaId={venta.id} numero={venta.numero} tipo={venta.tipo} />
        </div>
      )}
    </div>
  );
}

function Dato({ titulo, valor, fuerte = false }: { titulo: string; valor: string; fuerte?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{titulo}</p>
      <p className={fuerte ? "mt-0.5 text-xl font-semibold tabular-nums text-gray-900" : "mt-0.5 text-sm text-gray-800"}>{valor}</p>
    </div>
  );
}
