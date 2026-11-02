"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatKg, formatKgNum, formatPct } from "@/modules/core/formato/numeros";
import { StockBadge } from "@/modules/core/inventario/components/stock-badge";
import { LineaBadge } from "../../components/linea-badge";
import { calcularMerma } from "../../procesos/lib/merma";
import { fechaCorta, parsearDecimal } from "../../procesos/lib/numero";
import { ARTICULO_PASO, origenPeso, type LotePasos } from "../../procesos/lib/pasos";
import type { BultoPlanta, LoteParaProceso } from "../../procesos/types-planta";
import { etiquetaPresentacion, nombreProductoTerminado } from "../../tipos/lib/productos";
import { registrarEmpaque } from "../actions/empaque.actions";
import {
  cuadreMolienda,
  destinosDeLinea,
  enteroConMiles,
  ETIQUETA_DESTINO,
  ETIQUETA_FORMA,
  FORMAS_CAFE,
  kgDeForma,
  llegaConMolienda,
  faltantesDeInsumo,
  parsearUnidades,
  resumenEmpaque,
  textoEmpacadas,
  textoFaltante,
  textoKgLinea,
  type DestinoDiferencia,
  type FormaCafe,
  type LineaEmpaqueEntrada,
  type MoliendaEntrada,
} from "../lib/empaque";
import { empaqueSchema } from "../schemas/empaque.schema";
import type { ConfigEmpaque, ResultadoEmpaque } from "../types";

// Formulario de EMPAQUE (A-01), pensado para tablet: campos y botones de 44 px como mínimo, teclado numérico
// (`inputMode`) y ninguna pista que dependa del hover. Ya no muestra bultos ni pide «peso de salida»: lo que llega a
// empaque es la salida del paso anterior que aún no se ha empacado (lo calcula el servidor) y el operario solo dice
// cuántas bolsas de cada tamaño salieron. Lo que sobra NO es merma: hay que decir adónde fue (suelto, granel,
// muestra o pérdida). Marca propia mueve inventario (bolsas, etiquetas, producto terminado) y avisa —no bloquea— si
// faltan insumos; servicios a terceros solo registra las líneas, con tamaños libres.
const CAMPO = "h-11 text-base";

/** Empaque de un café REABIERTO (CO-33): sin bultos, lo que llega es todo lo reabierto (o su molienda). */
export interface ReaperturaEmpaque {
  id: string;
  /** De dónde viene el café, para el texto de lo que llega: «Viene de la reapertura de 40 × Excelso 500 g (20 kg)». */
  origen: string;
}

interface EmpaqueFormProps {
  lote: Pick<LoteParaProceso["lote"], "id" | "linea" | "servicios" | "tipoCafe">;
  bultos: BultoPlanta[];
  config: ConfigEmpaque;
  /** `YYYY-MM-DD` de hoy en la zona del cliente (lo calcula el servidor). */
  fechaHoy: string;
  /** Bultos pendientes de empacar: se mandan sin mostrarlos (el operario no elige bultos). */
  bultoIdsIniciales: string[];
  /** Lo que llega a empaque (kg): salida del paso anterior pendiente de empacar. */
  pesoDisponibleInicial: number | null;
  /** Presente = se empaca un café reabierto en vez de bultos del lote. */
  reapertura?: ReaperturaEmpaque;
}

/** Fila de tamaño libre (servicios a terceros): el tamaño se escribe en kg y se guarda en gramos. La bolsa siempre es del cliente. */
interface FilaLibre {
  clave: number;
  kgTxt: string;
  unidadesTxt: string;
}

/** Clave de las unidades escritas por presentación y forma (marca propia). */
const claveUnidades = (g: number, forma: FormaCafe) => `${g}:${forma}`;

export function EmpaqueForm({ lote, bultos, config, fechaHoy, bultoIdsIniciales, pesoDisponibleInicial, reapertura }: EmpaqueFormProps) {
  const router = useRouter();
  const esMarcaPropia = lote.linea === "marca_propia";
  const lotePasos: LotePasos = { linea: lote.linea, servicios: lote.servicios };

  const llegaKg = pesoDisponibleInicial;
  const [fecha, setFecha] = useState(fechaHoy);
  const [unidadesTxt, setUnidadesTxt] = useState<Record<string, string>>({});
  /** Forma que se está editando en cada presentación (el toggle Grano | Molido). */
  const [formaActiva, setFormaActiva] = useState<Record<number, FormaCafe>>({});
  const [molEntradaTxt, setMolEntradaTxt] = useState("");
  const [molSalidaTxt, setMolSalidaTxt] = useState("");
  const [filas, setFilas] = useState<FilaLibre[]>([{ clave: 1, kgTxt: "", unidadesTxt: "" }]);
  const [destino, setDestino] = useState<DestinoDiferencia | null>(null);
  const [observaciones, setObservaciones] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Líneas de bolsas con lo que el operario escribió, en gramos enteros.
  const lineas: (LineaEmpaqueEntrada & { producto: string; bolsaCliente: boolean })[] = esMarcaPropia
    ? config.presentaciones.flatMap((p) =>
        FORMAS_CAFE.flatMap((forma) => {
          const unidades = parsearUnidades(unidadesTxt[claveUnidades(p.presentacionG, forma)]);
          if (unidades === null) return [];
          const base = nombreProductoTerminado(lote.tipoCafe ?? "Café", p.presentacionG);
          const producto = forma === "molido" ? (p.productoMolido?.nombre ?? `${base} molido`) : (p.producto?.nombre ?? base);
          return [{ presentacionG: p.presentacionG, unidades, forma, bolsaCliente: false, producto }];
        }),
      )
    : filas.flatMap((f) => {
        const kg = parsearDecimal(f.kgTxt);
        const unidades = parsearUnidades(f.unidadesTxt);
        if (kg === null || kg <= 0 || unidades === null) return [];
        const g = Math.round(kg * 1000);
        // Bolsas del cliente (A-02): el peso es libre y la bolsa nunca descuenta insumos.
        return [{ presentacionG: g, unidades, forma: "grano" as const, bolsaCliente: true, producto: etiquetaPresentacion(g) }];
      });

  // Molienda en el mismo paso (A-02): solo con líneas de café molido y sin reapertura (ahí ya está registrada).
  const hayMolido = esMarcaPropia && lineas.some((l) => l.forma === "molido");
  const pideMolienda = hayMolido && !reapertura;
  const molEntrada = parsearDecimal(molEntradaTxt);
  const molSalida = parsearDecimal(molSalidaTxt);
  const molienda: MoliendaEntrada | null =
    pideMolienda && molEntrada !== null && molEntrada > 0 && molSalida !== null && molSalida <= molEntrada ? { entradaKg: molEntrada, salidaKg: molSalida } : null;
  const cuadreMol = llegaKg !== null ? cuadreMolienda(llegaKg, molienda, lineas) : null;
  const mermaMol = molienda ? calcularMerma(molienda.entradaKg, molienda.salidaKg) : null;
  const llegaEfectivaKg = llegaKg !== null && molienda ? llegaConMolienda(llegaKg, molienda) : llegaKg;
  const moliendaIncompleta = pideMolienda && (molEntradaTxt.trim() !== "" || molSalidaTxt.trim() !== "") && molienda === null;

  const resumen = resumenEmpaque(llegaEfectivaKg, lineas);
  const faltantes = esMarcaPropia
    ? faltantesDeInsumo(
        config.presentaciones.map((p) => ({
          presentacionG: p.presentacionG,
          unidades: lineas.filter((l) => l.presentacionG === p.presentacionG).reduce((n, l) => n + l.unidades, 0),
          bolsaStock: p.bolsa?.stock ?? null,
          etiquetaStock: p.etiqueta?.stock ?? null,
        })),
      )
    : [];

  const seleccionados = bultos.filter((b) => bultoIdsIniciales.includes(b.id));
  const origen = origenPeso(lotePasos, "empaque", seleccionados);
  const textoOrigen =
    llegaKg === null
      ? "No se pudo calcular lo que llega a empaque: recarga la página."
      : reapertura
        ? reapertura.origen
        : origen.previo
          ? `Viene de ${ARTICULO_PASO[origen.previo]} del ${origen.fechas.map((f) => fechaCorta(f)).join(" y ") || "—"}`
          : "Café pendiente de empacar";

  const destinosPosibles = destinosDeLinea(lote.linea);
  const falta = resumen?.haySobrante && destino === null;
  const cuadreMalo = cuadreMol !== null && (cuadreMol.molidoSupera || cuadreMol.granoSupera);
  const deshabilitado = enviando || resumen === null || lineas.length === 0 || resumen.supera || falta === true || moliendaIncompleta || cuadreMalo;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (moliendaIncompleta) {
      setError("Revisa la molienda: lo que entra es mayor que cero y lo que sale no puede superarlo");
      return;
    }
    if (cuadreMalo) {
      setError("Las bolsas no cuadran con lo molido y lo que quedó sin moler");
      return;
    }
    if (!resumen) {
      setError("No se pudo calcular lo que llega a empaque");
      return;
    }
    if (resumen.supera) {
      setError("Las bolsas suman más de lo que llega a empaque");
      return;
    }
    if (resumen.haySobrante && destino === null) {
      setError("Elige el destino de la diferencia");
      return;
    }
    const parsed = empaqueSchema.safeParse({
      loteId: lote.id,
      fecha,
      bultoIds: reapertura ? [] : bultoIdsIniciales,
      reaperturaId: reapertura?.id ?? null,
      pesoEntradaKg: null,
      molienda: molienda ? { entradaKg: molienda.entradaKg, salidaKg: molienda.salidaKg } : null,
      lineas: lineas.map(({ presentacionG, unidades, bolsaCliente, forma }) => ({ presentacionG, unidades, bolsaCliente, forma })),
      diferenciaDestino: resumen.haySobrante ? destino : null,
      observaciones,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisa los campos");
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
    terminar(r.data);
  }

  function terminar(d: ResultadoEmpaque) {
    toast.success(textoEmpacadas(d.lineas.map((l) => ({ unidades: l.unidades, producto: l.producto ?? etiquetaPresentacion(l.presentacion_g) }))), {
      description:
        d.diferencia_kg > 0 && d.diferencia_destino
          ? `${formatKg(d.diferencia_kg)}: ${ETIQUETA_DESTINO[d.diferencia_destino].toLowerCase()}`
          : "Todo el café quedó en bolsas",
    });
    for (const a of d.advertencias) {
      toast.warning(`${a.articulo ?? "Un insumo"} quedó en ${enteroConMiles(a.stock_resultante)}: registra la compra que falta.`);
    }
    // Último servicio de un lote de terceros: se ofrece entregarlo ahora o dejarlo para después.
    // El diálogo NO vive aquí: la Server Action revalida /planta/<lote> y la página se vuelve a pintar con otra `key`, así
    // que este formulario se desmonta antes de poder mostrarlo. Lo pinta la página (`LoteListoDialog`) con `?listo=1`.
    if (lote.linea === "servicio" && d.lote_estado === "listo") {
      router.replace(`/dashboard/cafe/planta/${lote.id}?listo=1`);
      return;
    }
    router.push("/dashboard/cafe/planta");
    router.refresh();
  }

  const boton = enviando ? "Guardando…" : "Registrar empaque";

  return (
    <form onSubmit={guardar} noValidate className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-sm text-gray-500">
                Empaque <LineaBadge linea={lote.linea} />
              </p>
              <p className="text-sm font-medium text-gray-600">Llega a empaque</p>
              <p className="text-4xl font-bold tabular-nums text-gray-900" aria-live="polite">
                {llegaKg !== null ? formatKg(llegaKg) : "—"}
              </p>
              <p className="text-xs text-gray-500">{textoOrigen}</p>
            </div>
            <div className="w-full space-y-1.5 sm:w-56">
              <Label htmlFor="emp-fecha">Fecha del empaque</Label>
              <Input id="emp-fecha" type="date" max={fechaHoy} className={CAMPO} value={fecha} onChange={(e) => setFecha(e.target.value)} />
              {fecha !== fechaHoy && <p className="text-xs text-gray-500">Registro de un día anterior.</p>}
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm" aria-labelledby="emp-bolsas">
          <div>
            <h2 id="emp-bolsas" className="text-base font-semibold text-gray-800">
              Bolsas
            </h2>
            <p className="text-xs text-gray-500">
              {esMarcaPropia
                ? "Elige la forma (grano o molido) y escribe cuántas unidades salieron de cada tamaño. Se descuentan una bolsa y una etiqueta por unidad y se suma el inventario de marca propia de esa forma."
                : "Agrega una línea por cada tamaño de bolsa: el peso de la bolsa en kilos (libre) y cuántas unidades salieron."}
            </p>
            {!esMarcaPropia && <p className="mt-1 text-xs font-medium text-gray-700">Bolsas del cliente · no descuenta insumos</p>}
          </div>

          {esMarcaPropia ? (
            <>
              {config.presentaciones.length === 0 && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  No hay bolsas activas en el inventario de insumos: crea una en Insumos para poder empacar.
                </p>
              )}
              <ul className="divide-y divide-gray-100">
                {config.presentaciones.map((p) => {
                  const g = p.presentacionG;
                  const forma = formaActiva[g] ?? "grano";
                  const clave = claveUnidades(g, forma);
                  const unidades = parsearUnidades(unidadesTxt[clave]);
                  const bloqueada = !p.bolsa || !p.etiqueta;
                  const faltante = faltantes.filter((f) => f.presentacionG === g);
                  const base = nombreProductoTerminado(lote.tipoCafe ?? "Café", g);
                  const productoForma = forma === "molido" ? p.productoMolido : p.producto;
                  const nombre = productoForma?.nombre ?? (forma === "molido" ? `${base} molido` : base);
                  const hayTexto = (unidadesTxt[clave] ?? "").trim() !== "";
                  const otra: FormaCafe = forma === "grano" ? "molido" : "grano";
                  const unidadesOtra = parsearUnidades(unidadesTxt[claveUnidades(g, otra)]);
                  return (
                    <li key={g} className={cn("grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_11rem]", bloqueada && "opacity-70")}>
                      <div className="min-w-0 space-y-2">
                        <p className="text-lg font-semibold text-gray-900">
                          {etiquetaPresentacion(g)} <span className="text-sm font-normal text-gray-500">· {nombre}</span>
                        </p>
                        <div role="radiogroup" aria-label={`Forma del café de ${etiquetaPresentacion(g)}`} className="inline-flex rounded-lg border border-gray-300 p-0.5">
                          {FORMAS_CAFE.map((f) => (
                            <button
                              key={f}
                              type="button"
                              role="radio"
                              aria-checked={forma === f}
                              disabled={bloqueada || enviando}
                              onClick={() => setFormaActiva((prev) => ({ ...prev, [g]: f }))}
                              className={cn(
                                "min-h-11 min-w-24 rounded-md px-4 text-base font-semibold transition-colors",
                                forma === f ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100",
                              )}
                            >
                              {ETIQUETA_FORMA[f]}
                            </button>
                          ))}
                        </div>
                        {unidadesOtra !== null && (
                          <p className="text-xs text-gray-600">
                            También: {enteroConMiles(unidadesOtra)} u de {ETIQUETA_FORMA[otra].toLowerCase()}
                          </p>
                        )}
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
                            <span className="text-gray-500">
                              En inventario ({ETIQUETA_FORMA[forma].toLowerCase()}): {enteroConMiles(productoForma?.stock ?? 0)} u
                            </span>
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
                          Unidades de {etiquetaPresentacion(g)} {ETIQUETA_FORMA[forma].toLowerCase()}
                        </Label>
                        <Input
                          id={`emp-u-${g}`}
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="Unidades"
                          disabled={bloqueada || enviando}
                          className={cn(CAMPO, "text-right tabular-nums")}
                          aria-invalid={hayTexto && unidades === null}
                          value={unidadesTxt[clave] ?? ""}
                          onChange={(e) => setUnidadesTxt((prev) => ({ ...prev, [clave]: e.target.value }))}
                        />
                        <p className={cn("text-right text-xs tabular-nums", hayTexto && unidades === null ? "text-red-600" : "text-gray-500")}>
                          {hayTexto && unidades === null ? "Solo números enteros" : `equivale a ${unidades ? textoKgLinea(g, unidades) : "0,000"} kg`}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <Button asChild type="button" variant="outline" className="h-11">
                <Link href="/dashboard/cafe/inventario?tab=insumos">
                  <Plus className="h-4 w-4" aria-hidden /> Otro tamaño de bolsa
                </Link>
              </Button>
            </>
          ) : (
            <>
              <ul className="space-y-3">
                {filas.map((f, i) => {
                  const kg = parsearDecimal(f.kgTxt);
                  const unidades = parsearUnidades(f.unidadesTxt);
                  const malKg = f.kgTxt.trim() !== "" && (kg === null || kg <= 0);
                  const malU = f.unidadesTxt.trim() !== "" && unidades === null;
                  return (
                    <li key={f.clave} className="grid gap-3 rounded-md border border-gray-100 p-3 sm:grid-cols-[9rem_8rem_minmax(0,1fr)_auto] sm:items-start">
                      <div className="space-y-1">
                        <Label htmlFor={`emp-kg-${f.clave}`}>Peso de la bolsa (kg)</Label>
                        <Input
                          id={`emp-kg-${f.clave}`}
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="Ej: 2,5"
                          disabled={enviando}
                          className={cn(CAMPO, "text-right tabular-nums")}
                          aria-invalid={malKg}
                          value={f.kgTxt}
                          onChange={(e) => setFilas((prev) => prev.map((x) => (x.clave === f.clave ? { ...x, kgTxt: e.target.value } : x)))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`emp-fu-${f.clave}`}>Cantidad</Label>
                        <Input
                          id={`emp-fu-${f.clave}`}
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="Ej: 12"
                          disabled={enviando}
                          className={cn(CAMPO, "text-right tabular-nums")}
                          aria-invalid={malU}
                          value={f.unidadesTxt}
                          onChange={(e) => setFilas((prev) => prev.map((x) => (x.clave === f.clave ? { ...x, unidadesTxt: e.target.value } : x)))}
                        />
                      </div>
                      <p className={cn("text-xs tabular-nums sm:mt-7", malKg || malU ? "text-red-600" : "text-gray-500")}>
                        {malKg ? "El peso es un número mayor que cero" : malU ? "Solo números enteros" : kg && unidades ? `equivale a ${formatKg(kg * unidades)}` : ""}
                      </p>
                      {filas.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-11 w-11 p-0 sm:mt-6"
                          aria-label={`Quitar la línea ${i + 1}`}
                          disabled={enviando}
                          onClick={() => setFilas((prev) => prev.filter((x) => x.clave !== f.clave))}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                disabled={enviando}
                onClick={() => setFilas((prev) => [...prev, { clave: Math.max(0, ...prev.map((x) => x.clave)) + 1, kgTxt: "", unidadesTxt: "" }])}
              >
                <Plus className="h-4 w-4" aria-hidden /> Otro tamaño de bolsa
              </Button>
            </>
          )}
        </section>

        {pideMolienda && (
          <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm" aria-labelledby="emp-molienda">
            <div>
              <h2 id="emp-molienda" className="text-base font-semibold text-gray-800">
                Molienda del café molido
              </h2>
              <p className="text-xs text-gray-500">
                Cuánto café entra a moler y cuánto sale. Se registra la molienda del lote sin salir de esta pantalla. Déjalo vacío solo si estos bultos ya se molieron en Planta.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="emp-mol-e">Entra a moler (kg)</Label>
                <Input
                  id="emp-mol-e"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={cuadreMol ? undefined : `Ej: ${formatKgNum(kgDeMolido(lineas))}`}
                  disabled={enviando}
                  className={cn(CAMPO, "text-right tabular-nums")}
                  aria-invalid={moliendaIncompleta}
                  value={molEntradaTxt}
                  onChange={(e) => setMolEntradaTxt(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="emp-mol-s">Sale de la molienda (kg)</Label>
                <Input
                  id="emp-mol-s"
                  inputMode="decimal"
                  autoComplete="off"
                  disabled={enviando}
                  className={cn(CAMPO, "text-right tabular-nums")}
                  aria-invalid={moliendaIncompleta}
                  value={molSalidaTxt}
                  onChange={(e) => setMolSalidaTxt(e.target.value)}
                />
              </div>
            </div>
            {moliendaIncompleta && (
              <p role="alert" className="text-sm text-red-700">
                Lo que entra es un número mayor que cero y lo que sale no puede superarlo.
              </p>
            )}
            {mermaMol && (
              <p className="text-sm text-gray-700" aria-live="polite">
                Merma de molienda: <span className="font-semibold tabular-nums">{formatKg(mermaMol.mermaKg)}</span> · {formatPct(mermaMol.mermaPct)}
                <span className="ml-1 text-xs text-gray-500">(sin referencia definida todavía: solo informativa)</span>
              </p>
            )}
            {cuadreMol?.molidoSupera && (
              <p role="alert" className="text-sm font-medium text-red-700">
                El café molido en bolsas suma {formatKg(cuadreMol.molidoKg)} y de la molienda solo salen {formatKg(molienda!.salidaKg)}.
              </p>
            )}
            {cuadreMol?.granoSupera && (
              <p role="alert" className="text-sm font-medium text-red-700">
                El café en grano suma {formatKg(cuadreMol.granoKg)} y sin moler quedan {formatKg(cuadreMol.sinMolerKg)}.
              </p>
            )}
          </section>
        )}

        {resumen?.haySobrante && (
          <section className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4 shadow-sm" aria-labelledby="emp-destino">
            <div>
              <h2 id="emp-destino" className="text-base font-semibold text-gray-800">
                Sobran {formatKg(resumen.diferenciaKg)}: ¿qué pasó con ese café?
              </h2>
              <p className="text-xs text-gray-600">Elige un destino para poder guardar. No es merma: el café queda registrado donde corresponde.</p>
            </div>
            <div role="radiogroup" aria-labelledby="emp-destino" className="grid gap-2 sm:grid-cols-3">
              {destinosPosibles.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={destino === d}
                  disabled={enviando}
                  onClick={() => setDestino(d)}
                  className={cn(
                    "min-h-14 rounded-lg border px-4 py-3 text-left text-base font-semibold transition-colors",
                    destino === d ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50",
                  )}
                >
                  {ETIQUETA_DESTINO[d]}
                </button>
              ))}
            </div>
          </section>
        )}

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
        <ResumenEnVivo resumen={resumen} destino={destino} llegaOriginalKg={llegaKg} />
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

      {/* Tablet (< 1280 px): una sola columna, así que el cuadre en vivo y el botón de guardar quedan fijos al pie. */}
      <div className="sticky bottom-0 z-10 flex flex-row-reverse items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-lg xl:hidden">
        <p className="min-w-0 text-right text-sm text-gray-600">
          {resumen && !resumen.supera ? (
            <>
              Diferencia <span className="text-xl font-bold tabular-nums text-gray-900">{formatKg(resumen.diferenciaKg)}</span>
            </>
          ) : resumen?.supera ? (
            <span className="font-semibold text-red-700">Bolsas de más: {formatKg(resumen.excesoKg)}</span>
          ) : (
            "Diferencia: —"
          )}
        </p>
        <Button type="submit" className="h-12 shrink-0 px-6 text-base" disabled={deshabilitado}>
          {boton}
        </Button>
      </div>
    </form>
  );
}

/** Cuadre en vivo: Llega · Usado en bolsas · Diferencia (y su destino). La diferencia no es merma. */
/** Kilos de las líneas de café molido, para sugerir cuánto entra a moler. */
function kgDeMolido(lineas: readonly LineaEmpaqueEntrada[]): number {
  return kgDeForma(lineas, "molido");
}

function ResumenEnVivo({ resumen, destino, llegaOriginalKg }: { resumen: ReturnType<typeof resumenEmpaque>; destino: DestinoDiferencia | null; llegaOriginalKg: number | null }) {
  return (
    <section aria-live="polite" className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-gray-800">Resumen del empaque</h2>
      <dl className="space-y-2 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-gray-500">Llega</dt>
          <dd className="tabular-nums text-gray-900">{resumen ? formatKg(resumen.llegaKg) : "—"}</dd>
        </div>
        {resumen && llegaOriginalKg !== null && Math.abs(resumen.llegaKg - llegaOriginalKg) > 0.0005 && (
          <p className="text-xs text-gray-500">Con la molienda: {formatKg(llegaOriginalKg)} tostados → {formatKg(resumen.llegaKg)} a empaque.</p>
        )}
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-gray-500">Usado en bolsas</dt>
          <dd className="text-lg font-semibold tabular-nums text-gray-900">{resumen ? formatKg(resumen.usadoKg) : "—"}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-gray-500">Diferencia</dt>
          <dd className="tabular-nums text-gray-900">
            {resumen && !resumen.supera ? <span className="text-lg font-semibold">{formatKg(resumen.diferenciaKg)}</span> : "—"}
          </dd>
        </div>
        {resumen?.haySobrante && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-gray-500">Destino</dt>
            <dd className={cn("text-right text-sm", destino ? "font-medium text-gray-900" : "text-amber-800")}>{destino ? ETIQUETA_DESTINO[destino] : "Elige uno"}</dd>
          </div>
        )}
      </dl>
      {resumen?.supera && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          Las bolsas suman más de lo que llega a empaque ({formatKgNum(resumen.excesoKg)} kg de más). Baja las unidades.
        </p>
      )}
      <p className="text-xs text-gray-500">Cuadre: bolsas + diferencia = lo que llega. El empaque no genera merma.</p>
    </section>
  );
}
