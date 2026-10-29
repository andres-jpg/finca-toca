"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { StockBadge } from "@/modules/core/inventario/components/stock-badge";
import { formatearKg3, formatearPct } from "../../lotes/lib/formato";
import { consultarPesoDisponible } from "../../procesos/actions/procesos.actions";
import { SelectorBultos } from "../../procesos/components/selector-bultos";
import { aTextoDecimal, fechaCorta, formatearPeso, parsearDecimal } from "../../procesos/lib/numero";
import { ARTICULO_PASO, origenPeso, type LotePasos } from "../../procesos/lib/pasos";
import type { BultoPlanta, LoteParaProceso } from "../../procesos/types-planta";
import { etiquetaPresentacion, nombreProductoTerminado } from "../../tipos/lib/productos";
import { registrarEmpaque } from "../actions/empaque.actions";
import {
  enteroConMiles,
  faltantesDeInsumo,
  parsearUnidades,
  textoEmpacadas,
  textoFaltante,
  textoKgLinea,
  vistaPreviaEmpaque,
  type LineaEmpaqueEntrada,
} from "../lib/empaque";
import { empaqueSchema } from "../schemas/empaque.schema";
import type { ConfigEmpaque } from "../types";

// Formulario de empaque de MARCA PROPIA, pensado para tablet: campos y botones de 44 px como mínimo, teclado
// numérico (`inputMode`), y ninguna pista que dependa del hover. La merma y los avisos de insumos se calculan en
// vivo con las mismas cuentas que la RPC; faltar bolsas o etiquetas AVISA y no bloquea (decisión 14 de CO-20),
// empacar más de lo que hay sí se frena (la base lo rechaza con `empaque_supera_peso`). Reemplaza al formulario
// genérico de proceso cuando el paso es el empaque de un lote de marca propia.
const CAMPO = "h-11 text-base";

/** Empaque de un café REABIERTO (CO-33): sin bultos, el peso de entrada es todo lo reabierto (o su molienda). */
export interface ReaperturaEmpaque {
  id: string;
  /** De dónde viene el café, para el texto del peso: «Viene de la reapertura de 40 × Excelso 500 g (20 kg)». */
  origen: string;
}

interface EmpaqueFormProps {
  lote: Pick<LoteParaProceso["lote"], "id" | "linea" | "servicios" | "tipoCafe">;
  bultos: BultoPlanta[];
  config: ConfigEmpaque;
  /** `YYYY-MM-DD` de hoy en la zona del cliente (lo calcula el servidor). */
  fechaHoy: string;
  /** Bultos elegibles para empacar (preseleccionados). */
  bultoIdsIniciales: string[];
  pesoDisponibleInicial: number | null;
  /** Presente = se empaca un café reabierto en vez de bultos del lote. */
  reapertura?: ReaperturaEmpaque;
}

export function EmpaqueForm({ lote, bultos, config, fechaHoy, bultoIdsIniciales, pesoDisponibleInicial, reapertura }: EmpaqueFormProps) {
  const router = useRouter();
  const unSoloBulto = bultos.length === 1;
  const lotePasos: LotePasos = useMemo(() => ({ linea: lote.linea, servicios: lote.servicios }), [lote.linea, lote.servicios]);

  const [bultoIds, setBultoIds] = useState<string[]>(bultoIdsIniciales);
  const [entradaTxt, setEntradaTxt] = useState(aTextoDecimal(pesoDisponibleInicial));
  const [pesoDisp, setPesoDisp] = useState<number | null>(pesoDisponibleInicial);
  const [cargandoPeso, setCargandoPeso] = useState(false);
  const [fecha, setFecha] = useState(fechaHoy);
  const [unidadesTxt, setUnidadesTxt] = useState<Record<number, string>>({});
  const [observaciones, setObservaciones] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const peticion = useRef(0);

  // Peso disponible para la selección actual (RPC `cafe.peso_disponible`). Se consulta al CAMBIAR la selección
  // (evento) y una respuesta tardía de una selección anterior se descarta.
  async function cambiarSeleccion(ids: string[]) {
    setBultoIds(ids);
    const esta = ++peticion.current;
    if (ids.length === 0) {
      setCargandoPeso(false);
      setPesoDisp(null);
      setEntradaTxt("");
      return;
    }
    setCargandoPeso(true);
    const r = await consultarPesoDisponible(lote.id, "empaque", ids);
    if (esta !== peticion.current) return;
    setCargandoPeso(false);
    if (!r.ok) {
      toast.error(r.message);
      setPesoDisp(null);
      return;
    }
    setPesoDisp(r.data);
    setEntradaTxt(aTextoDecimal(r.data));
  }

  const entradaKg = parsearDecimal(entradaTxt);
  const lineas: (LineaEmpaqueEntrada & { producto: string })[] = config.presentaciones.flatMap((p) => {
    const unidades = parsearUnidades(unidadesTxt[p.presentacionG]);
    return unidades === null ? [] : [{ presentacionG: p.presentacionG, unidades, producto: p.producto?.nombre ?? nombreProductoTerminado(lote.tipoCafe ?? "Café", p.presentacionG) }];
  });
  const vista = vistaPreviaEmpaque(entradaKg, lineas);
  const faltantes = faltantesDeInsumo(
    config.presentaciones.map((p) => ({
      presentacionG: p.presentacionG,
      unidades: parsearUnidades(unidadesTxt[p.presentacionG]) ?? 0,
      bolsaStock: p.bolsa?.stock ?? null,
      etiquetaStock: p.etiqueta?.stock ?? null,
    })),
  );
  const entradaSupera = entradaKg !== null && pesoDisp !== null && entradaKg > pesoDisp * 1.005;

  const seleccionados = bultos.filter((b) => bultoIds.includes(b.id));
  const origen = origenPeso(lotePasos, "empaque", seleccionados);
  const textoOrigen =
    pesoDisp === null
      ? "No se pudo calcular el peso disponible: escríbelo."
      : reapertura
        ? `${reapertura.origen}: ${formatearPeso(pesoDisp)} kg`
        : origen.previo
        ? `Viene de ${ARTICULO_PASO[origen.previo]} del ${origen.fechas.map((f) => fechaCorta(f)).join(" y ") || "—"}: ${formatearPeso(pesoDisp)} kg`
        : `Suma de los bultos elegidos: ${formatearPeso(pesoDisp)} kg`;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!reapertura && !unSoloBulto && bultoIds.length === 0) {
      setError("Elige al menos un bulto");
      return;
    }
    const parsed = empaqueSchema.safeParse({
      loteId: lote.id,
      fecha,
      bultoIds: reapertura ? [] : bultoIds,
      reaperturaId: reapertura?.id ?? null,
      pesoEntradaKg: entradaTxt,
      lineas: lineas.map(({ presentacionG, unidades }) => ({ presentacionG, unidades })),
      observaciones,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisa los campos");
      return;
    }
    if (vista?.supera) {
      setError(`Empacarías ${formatearPeso(vista.kgEmpacados)} kg y solo hay ${formatearPeso(entradaKg ?? 0)} kg: baja las unidades.`);
      return;
    }

    setEnviando(true);
    const r = await registrarEmpaque(parsed.data);
    setEnviando(false);
    if (!r.ok) {
      setError(r.message);
      toast.error(r.message);
      return;
    }
    const d = r.data;
    toast.success(textoEmpacadas(d.lineas), {
      description: `Merma ${formatearPeso(d.merma_kg)} kg · lote ${d.lote_estado === "listo" ? "listo" : `avance ${d.avance_texto}`}`,
    });
    for (const a of d.advertencias) {
      toast.warning(`${a.articulo ?? "Un insumo"} quedó en ${enteroConMiles(a.stock_resultante)}: registra la compra que falta.`);
    }
    router.push("/dashboard/cafe/planta");
    router.refresh();
  }

  const boton = enviando ? "Guardando…" : "Registrar empaque";
  const deshabilitado = enviando || cargandoPeso || lineas.length === 0 || vista?.supera === true;

  return (
    <form onSubmit={guardar} noValidate className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        {!unSoloBulto && !reapertura && (
          <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Bultos</h2>
              <p className="text-xs text-gray-500">
                Empaca solo los bultos que terminas: el café que entra y no se empaca cuenta como merma del empaque.
              </p>
            </div>
            <SelectorBultos lote={lotePasos} tipo="empaque" bultos={bultos} seleccionados={bultoIds} onChange={cambiarSeleccion} disabled={enviando} />
          </section>
        )}

        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="emp-entrada">Peso de entrada (kg)</Label>
              <Input
                id="emp-entrada"
                inputMode="decimal"
                autoComplete="off"
                placeholder="Ej: 81"
                className={CAMPO}
                value={entradaTxt}
                readOnly={reapertura !== undefined}
                onChange={(e) => setEntradaTxt(e.target.value)}
              />
              <p className="text-xs text-gray-500" aria-live="polite">
                {cargandoPeso ? "Calculando el peso disponible…" : textoOrigen}
              </p>
              {entradaSupera && pesoDisp !== null && (
                <p role="alert" className="text-xs font-medium text-red-600">
                  Supera el peso disponible ({formatearPeso(pesoDisp)} kg): el sistema no lo aceptará.
                </p>
              )}
              {!reapertura && pesoDisp !== null && entradaKg !== pesoDisp && (
                <Button type="button" variant="outline" className="h-11" onClick={() => setEntradaTxt(aTextoDecimal(pesoDisp))}>
                  Usar el disponible ({formatearPeso(pesoDisp)} kg)
                </Button>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="emp-fecha">Fecha del empaque</Label>
              <Input id="emp-fecha" type="date" max={fechaHoy} className={CAMPO} value={fecha} onChange={(e) => setFecha(e.target.value)} />
              {fecha !== fechaHoy && <p className="text-xs text-gray-500">Registro de un día anterior.</p>}
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm" aria-labelledby="emp-presentaciones">
          <div>
            <h2 id="emp-presentaciones" className="text-base font-semibold text-gray-800">
              Presentaciones empacadas
            </h2>
            <p className="text-xs text-gray-500">
              Escribe cuántas unidades salieron de cada tamaño. Se descuentan una bolsa y una etiqueta por unidad y se suma el producto terminado.
            </p>
          </div>

          {config.presentaciones.length === 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              No hay bolsas activas en el inventario de insumos: crea una en Insumos para poder empacar.
            </p>
          )}

          <ul className="divide-y divide-gray-100">
            {config.presentaciones.map((p) => {
              const g = p.presentacionG;
              const unidades = parsearUnidades(unidadesTxt[g]);
              const bloqueada = !p.bolsa || !p.etiqueta;
              const faltante = faltantes.filter((f) => f.presentacionG === g);
              const nombre = p.producto?.nombre ?? nombreProductoTerminado(lote.tipoCafe ?? "Café", g);
              const hayTexto = (unidadesTxt[g] ?? "").trim() !== "";
              return (
                <li key={g} className={cn("grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_11rem]", bloqueada && "opacity-70")}>
                  <div className="min-w-0 space-y-2">
                    <p className="text-lg font-semibold text-gray-900">
                      {etiquetaPresentacion(g)} <span className="text-sm font-normal text-gray-500">· {nombre}</span>
                    </p>
                    {bloqueada ? (
                      <p role="alert" className="text-sm text-amber-900">
                        Falta {!p.bolsa && !p.etiqueta ? "la bolsa y la etiqueta" : !p.bolsa ? "la bolsa" : "la etiqueta"} de {etiquetaPresentacion(g)}: créala en Insumos para empacar este tamaño.
                      </p>
                    ) : (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-gray-600">
                        <span className="inline-flex items-center gap-1.5">
                          Bolsas <StockBadge stock={p.bolsa!.stock} stockMinimo={p.bolsa!.stockMinimo} />
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          Etiquetas <StockBadge stock={p.etiqueta!.stock} stockMinimo={p.etiqueta!.stockMinimo} />
                        </span>
                        {p.producto && <span className="text-gray-500">En inventario: {enteroConMiles(p.producto.stock)} u</span>}
                      </div>
                    )}
                    {faltante.map((f) => (
                      <p key={f.clase} role="status" className="flex items-start gap-1.5 text-sm text-amber-900">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        {textoFaltante(f)}
                      </p>
                    ))}
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor={`emp-u-${g}`} className="sr-only">
                      Unidades de {etiquetaPresentacion(g)}
                    </Label>
                    <Input
                      id={`emp-u-${g}`}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="Unidades"
                      disabled={bloqueada || enviando}
                      className={cn(CAMPO, "text-right tabular-nums")}
                      aria-invalid={hayTexto && unidades === null}
                      value={unidadesTxt[g] ?? ""}
                      onChange={(e) => setUnidadesTxt((prev) => ({ ...prev, [g]: e.target.value }))}
                    />
                    <p className={cn("text-right text-xs tabular-nums", hayTexto && unidades === null ? "text-red-600" : "text-gray-500")}>
                      {hayTexto && unidades === null ? "Solo números enteros" : `equivale a ${unidades ? textoKgLinea(g, unidades) : "0,000"} kg`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="space-y-1.5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <Label htmlFor="emp-obs">Observaciones (opcional)</Label>
          <Textarea id="emp-obs" rows={2} className="text-base" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
        </section>

        {error && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
      </div>

      <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <ResumenEmpaque vista={vista} entradaKg={entradaKg} />
        {/* En pantalla ancha el botón vive aquí; en tablet va en la barra fija de abajo. */}
        <div className="hidden space-y-4 xl:block">
          <Button type="submit" className="h-12 w-full text-base" disabled={deshabilitado}>
            {boton}
          </Button>
          <Button asChild type="button" variant="outline" className="h-11 w-full">
            <Link href="/dashboard/cafe/planta">Cancelar</Link>
          </Button>
        </div>
      </aside>

      {/* Tablet (< 1280 px): una sola columna, así que la merma en vivo y el botón de guardar quedan fijos al pie. */}
      <div className="sticky bottom-0 z-10 flex flex-row-reverse items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-lg xl:hidden">
        <p className="min-w-0 text-right text-sm text-gray-600">
          {vista && !vista.supera ? (
            <>
              <span className="text-xl font-bold tabular-nums text-gray-900">{formatearPct(vista.mermaPct)}</span>{" "}
              <span className="tabular-nums">{formatearKg3(vista.mermaKg)} kg</span>
            </>
          ) : vista?.supera ? (
            <span className="font-semibold text-red-700">Supera por {formatearKg3(vista.excesoKg)} kg</span>
          ) : (
            "Merma: —"
          )}
        </p>
        <Button type="submit" className="h-12 shrink-0 px-6 text-base" disabled={deshabilitado}>
          {boton}
        </Button>
      </div>
    </form>
  );
}

/** Totales en vivo: kg empacados, merma en kg y %. Mientras `supera`, la merma no existe y se dice por cuánto. */
function ResumenEmpaque({ vista, entradaKg }: { vista: ReturnType<typeof vistaPreviaEmpaque>; entradaKg: number | null }) {
  return (
    <section aria-live="polite" className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-gray-800">Resumen del empaque</h2>
      <dl className="space-y-2 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-gray-500">Entra</dt>
          <dd className="tabular-nums text-gray-900">{entradaKg !== null ? `${formatearKg3(entradaKg)} kg` : "—"}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-gray-500">Café empacado</dt>
          <dd className="text-lg font-semibold tabular-nums text-gray-900">{vista ? `${formatearKg3(vista.kgEmpacados)} kg` : "—"}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-gray-500">Merma de empaque</dt>
          <dd className="tabular-nums text-gray-900">
            {vista && !vista.supera ? (
              <>
                <span className="text-lg font-semibold">{formatearPct(vista.mermaPct)}</span> · {formatearKg3(vista.mermaKg)} kg
              </>
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>
      {vista?.supera && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          Empacarías {formatearKg3(vista.excesoKg)} kg más de los que hay. No se puede empacar más café del que entra.
        </p>
      )}
      <p className="text-xs text-gray-500">El café que no se empaca (polvo, muestras de control) queda como merma. Este empaque no se cobra.</p>
    </section>
  );
}
