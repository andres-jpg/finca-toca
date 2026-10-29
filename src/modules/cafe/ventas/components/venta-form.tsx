"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { StockBadge } from "@/modules/core/inventario/components/stock-badge";
import { TerceroCombobox } from "@/modules/core/terceros/components/tercero-combobox";
import { formatearCOP, parsearPrecio } from "../../compras/lib/compra";
import { enteroConMiles, parsearUnidades } from "../../empaque/lib/empaque";
import { registrarVenta } from "../actions/ventas.actions";
import { avisoStock, subtotalLinea, textoVentaGuardada, totalUnidades, totalVenta } from "../lib/venta";
import { ventaSchema } from "../schemas/venta.schema";
import type { ProductoVenta, TipoVenta } from "../types";

// Formulario de venta o cortesía de marca propia, pensado para tablet en la puerta: campos y botones de 44 px como
// mínimo, teclado numérico (`inputMode`) y ninguna pista que dependa del hover. El total y los avisos de stock se
// calculan en vivo con las mismas cuentas que la RPC; vender más de lo que hay AVISA y no bloquea (el stock queda
// negativo, en rojo). La venta NO emite factura electrónica: solo guarda el número de la que se emite en Aliados.
const CAMPO = "h-11 text-base";
const SELECT =
  "h-11 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

interface FilaForm {
  /** Clave local de React (no viaja). */
  clave: number;
  articuloId: string;
  cantidad: string;
  precio: string;
}

/** Precio precargado: sin separador de miles ni símbolo (`23000`), como lo teclearía el operario. */
const textoPrecio = (p: number | null) => (p === null ? "" : String(p).replace(".", ","));

interface VentaFormProps {
  productos: ProductoVenta[];
  /** `YYYY-MM-DD` de hoy en la zona del cliente (lo calcula el servidor). */
  fechaHoy: string;
  /** Cliente por defecto: el «Consumidor final». */
  consumidorFinalId: string | null;
}

export function VentaForm({ productos, fechaHoy, consumidorFinalId }: VentaFormProps) {
  const router = useRouter();
  const siguiente = useRef(1);
  const [tipo, setTipo] = useState<TipoVenta>("venta");
  const [fecha, setFecha] = useState(fechaHoy);
  const [terceroId, setTerceroId] = useState<string | null>(consumidorFinalId);
  const [filas, setFilas] = useState<FilaForm[]>(() => [{ clave: 0, articuloId: "", cantidad: "", precio: "" }]);
  const [requiereFactura, setRequiereFactura] = useState(false);
  const [numeroFactura, setNumeroFactura] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const porId = useMemo(() => new Map(productos.map((p) => [p.articuloId, p])), [productos]);
  const grupos = useMemo(() => {
    const m = new Map<string, ProductoVenta[]>();
    for (const p of productos) m.set(p.tipoCafe, [...(m.get(p.tipoCafe) ?? []), p]);
    return [...m];
  }, [productos]);

  const esCortesia = tipo === "cortesia";
  const cuentas = filas.map((f) => ({
    cantidad: parsearUnidades(f.cantidad) ?? 0,
    precio: esCortesia ? 0 : (parsearPrecio(f.precio) ?? 0),
  }));
  const total = totalVenta(cuentas, tipo);
  const unidades = totalUnidades(cuentas);
  const elegidos = new Set(filas.map((f) => f.articuloId).filter(Boolean));

  const cambiar = (clave: number, cambios: Partial<FilaForm>) =>
    setFilas((prev) => prev.map((f) => (f.clave === clave ? { ...f, ...cambios } : f)));

  function elegirProducto(clave: number, articuloId: string) {
    const p = porId.get(articuloId);
    // Precarga el precio vigente (editable); sin precio queda vacío y el operario lo escribe.
    cambiar(clave, { articuloId, precio: textoPrecio(p?.precio ?? null) });
  }

  /** Una fila en blanco con su clave local. La clave se toma FUERA del updater de `setFilas` (en desarrollo React lo ejecuta dos veces). */
  const filaNueva = (): FilaForm => ({ clave: siguiente.current++, articuloId: "", cantidad: "", precio: "" });

  function agregarFila() {
    const nueva = filaNueva();
    setFilas((prev) => [...prev, nueva]);
  }

  function quitarFila(clave: number) {
    const reemplazo = filas.length === 1 ? filaNueva() : null;
    setFilas((prev) => (reemplazo ? [reemplazo] : prev.filter((f) => f.clave !== clave)));
  }

  function cambiarTipo(nuevo: TipoVenta) {
    setTipo(nuevo);
    // Una cortesía no se factura.
    if (nuevo === "cortesia") {
      setRequiereFactura(false);
      setNumeroFactura("");
    }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (filas.every((f) => f.articuloId === "")) {
      setError("Añade al menos un producto");
      return;
    }
    const parsed = ventaSchema.safeParse({
      tipo,
      fecha,
      terceroId,
      requiereFactura,
      numeroFactura,
      observaciones,
      // Las filas sin producto ni cantidad (la fila en blanco del final) no cuentan.
      lineas: filas.filter((f) => f.articuloId !== "" || f.cantidad.trim() !== "").map((f) => ({ articuloId: f.articuloId, cantidad: f.cantidad, precio: f.precio })),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisa los campos");
      return;
    }

    setEnviando(true);
    const r = await registrarVenta(parsed.data);
    setEnviando(false);
    if (!r.ok) {
      setError(r.message);
      toast.error(r.message);
      return;
    }
    toast.success(textoVentaGuardada(parsed.data.tipo, r.data.numero, r.data.total));
    for (const a of r.data.advertencias) {
      toast.warning(`${a.articulo ?? "Un producto"} quedó en ${enteroConMiles(a.stock_resultante)} en el inventario.`);
    }
    if (parsed.data.requiereFactura && !parsed.data.numeroFactura) {
      toast.info("La factura quedó pendiente: completa el número de Aliados cuando la emitas.");
    }
    router.push(`/dashboard/cafe/ventas/${r.data.id}`);
    router.refresh();
  }

  const boton = enviando ? "Guardando…" : esCortesia ? "Registrar cortesía" : "Guardar venta";
  const deshabilitado = enviando || terceroId === null || filas.every((f) => f.articuloId === "");

  return (
    <form onSubmit={guardar} noValidate className="space-y-6 pb-2">
      <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium text-gray-700">Tipo de registro</legend>
          <div role="radiogroup" aria-label="Tipo de registro" className="grid grid-cols-2 gap-2 sm:max-w-sm">
            {(["venta", "cortesia"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={tipo === t}
                onClick={() => cambiarTipo(t)}
                disabled={enviando}
                className={cn(
                  "h-12 rounded-md border text-base font-medium transition-colors",
                  tipo === t ? "border-amber-600 bg-amber-50 text-amber-900" : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50",
                )}
              >
                {t === "venta" ? "Venta" : "Cortesía"}
              </button>
            ))}
          </div>
          {esCortesia && (
            <p className="text-xs text-gray-500">La cortesía descuenta café del inventario sin valor: no suma al ingreso del día.</p>
          )}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <div className="[&_button[role=combobox]]:h-11 [&_button[role=combobox]]:text-base">
              <TerceroCombobox
                value={terceroId}
                onChange={(id) => setTerceroId(id)}
                rol="cliente"
                permitirCrear
                incluirConsumidorFinal
                placeholder="Selecciona o crea el cliente"
                disabled={enviando}
              />
            </div>
            <p className="text-xs text-gray-500">Si no se identifica, déjalo en «Consumidor final».</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="venta-fecha">Fecha</Label>
            <Input id="venta-fecha" type="date" max={fechaHoy} className={CAMPO} value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={enviando} />
            {fecha !== fechaHoy && <p className="text-xs text-gray-500">Registro de un día anterior.</p>}
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm" aria-labelledby="venta-productos">
        <div>
          <h2 id="venta-productos" className="text-base font-semibold text-gray-800">
            Productos
          </h2>
          <p className="text-xs text-gray-500">
            Elige el tipo de café y la presentación. El precio se precarga con el vigente y se puede cambiar; si no alcanza el inventario, el sistema avisa pero no bloquea.
          </p>
        </div>

        {productos.length === 0 && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            No hay productos terminados activos. Se crean al empacar un lote de marca propia.
          </p>
        )}

        <ul className="divide-y divide-gray-100">
          {filas.map((f, i) => {
            const p = porId.get(f.articuloId);
            const cantidad = parsearUnidades(f.cantidad);
            const hayCantidad = f.cantidad.trim() !== "";
            const precioNum = parsearPrecio(f.precio);
            const hayPrecio = f.precio.trim() !== "";
            const aviso = p && cantidad ? avisoStock(p.stock, cantidad) : null;
            const subtotal = subtotalLinea(cantidad ?? 0, esCortesia ? 0 : (precioNum ?? 0));
            return (
              <li key={f.clave} className="space-y-3 py-4">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_9rem_8rem_auto] sm:items-end">
                  <div className="space-y-1.5">
                    <Label htmlFor={`venta-prod-${f.clave}`}>Producto</Label>
                    <select
                      id={`venta-prod-${f.clave}`}
                      className={SELECT}
                      value={f.articuloId}
                      disabled={enviando}
                      onChange={(e) => elegirProducto(f.clave, e.target.value)}
                    >
                      <option value="">Elige un producto…</option>
                      {grupos.map(([tipoCafe, lista]) => (
                        <optgroup key={tipoCafe} label={tipoCafe}>
                          {lista.map((pr) => (
                            <option key={pr.articuloId} value={pr.articuloId} disabled={elegidos.has(pr.articuloId) && pr.articuloId !== f.articuloId}>
                              {pr.nombre} · {enteroConMiles(pr.stock)} en inventario
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor={`venta-cant-${f.clave}`}>Cantidad</Label>
                    <Input
                      id={`venta-cant-${f.clave}`}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="0"
                      disabled={enviando}
                      className={cn(CAMPO, "text-right tabular-nums")}
                      aria-invalid={hayCantidad && cantidad === null}
                      value={f.cantidad}
                      onChange={(e) => cambiar(f.clave, { cantidad: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor={`venta-precio-${f.clave}`}>Precio unitario ($)</Label>
                    <Input
                      id={`venta-precio-${f.clave}`}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder={p && p.precio === null ? "Sin precio: escríbelo" : "0"}
                      disabled={enviando || esCortesia}
                      className={cn(CAMPO, "text-right tabular-nums")}
                      aria-invalid={!esCortesia && hayPrecio && precioNum === null}
                      value={esCortesia ? "0" : f.precio}
                      onChange={(e) => cambiar(f.clave, { precio: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-gray-700">Subtotal</p>
                    <p className="flex h-11 items-center justify-end text-base font-semibold tabular-nums text-gray-900">{formatearCOP(subtotal)}</p>
                  </div>

                  <Button type="button" variant="ghost" className="h-11 w-11 shrink-0 justify-self-end p-0 text-gray-500 hover:text-red-600" onClick={() => quitarFila(f.clave)} disabled={enviando}>
                    <Trash2 className="h-5 w-5" />
                    <span className="sr-only">Quitar el producto {i + 1}</span>
                  </Button>
                </div>

                {p && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-gray-600">
                    <span className="inline-flex items-center gap-1.5">
                      En inventario <StockBadge stock={p.stock} stockMinimo={null} />
                    </span>
                    {!esCortesia && p.precio === null && <span className="text-amber-800">Este producto no tiene precio en la lista: escribe el valor.</span>}
                  </div>
                )}
                {aviso && (
                  <p role="status" className="flex items-start gap-1.5 text-sm text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    {aviso.texto}
                  </p>
                )}
                {hayCantidad && cantidad === null && (
                  <p role="alert" className="text-xs font-medium text-red-600">
                    Las unidades son un número entero mayor que cero.
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <Button type="button" variant="outline" className="h-11" onClick={agregarFila} disabled={enviando || filas.length >= productos.length}>
          <Plus className="mr-1.5 h-4 w-4" />
          Añadir producto
        </Button>
      </section>

      {!esCortesia && (
        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base font-medium text-gray-800">
            <input
              type="checkbox"
              className="h-5 w-5 accent-amber-600"
              checked={requiereFactura}
              disabled={enviando}
              onChange={(e) => {
                setRequiereFactura(e.target.checked);
                if (!e.target.checked) setNumeroFactura("");
              }}
            />
            ¿Requiere factura electrónica?
          </label>
          {requiereFactura && (
            <div className="space-y-1.5">
              <Label htmlFor="venta-factura">N.º de factura emitida en Aliados (opcional)</Label>
              <Input
                id="venta-factura"
                autoComplete="off"
                maxLength={40}
                className={cn(CAMPO, "sm:max-w-xs")}
                value={numeroFactura}
                disabled={enviando}
                onChange={(e) => setNumeroFactura(e.target.value)}
                placeholder="Ej: FE-1001"
              />
              <p className="text-xs text-gray-500">Si aún no la tienes, déjalo vacío: la venta queda con la factura «Pendiente» y el número se completa después.</p>
            </div>
          )}
          <p className="text-xs text-gray-500">Este registro no emite factura electrónica; la factura se emite en Aliados.</p>
        </section>
      )}

      <section className="space-y-1.5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <Label htmlFor="venta-obs">Observaciones (opcional)</Label>
        <Textarea id="venta-obs" rows={2} maxLength={500} className="text-base" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} disabled={enviando} />
      </section>

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {/* Total en vivo y guardar: fijos al pie, a mano del pulgar en la tablet. */}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
        <p aria-live="polite" className="min-w-0 text-sm text-gray-600">
          {esCortesia ? (
            <>
              <span className="text-xl font-bold tabular-nums text-gray-900">Sin valor</span> · {enteroConMiles(unidades)} {unidades === 1 ? "unidad" : "unidades"}
            </>
          ) : (
            <>
              Total <span className="text-xl font-bold tabular-nums text-gray-900">{formatearCOP(total)}</span> · {enteroConMiles(unidades)} {unidades === 1 ? "unidad" : "unidades"}
            </>
          )}
        </p>
        <div className="flex gap-2">
          <Button asChild type="button" variant="outline" className="h-12">
            <Link href="/dashboard/cafe/ventas">Cancelar</Link>
          </Button>
          <Button type="submit" className="h-12 px-6 text-base" disabled={deshabilitado}>
            {boton}
          </Button>
        </div>
      </div>
    </form>
  );
}
