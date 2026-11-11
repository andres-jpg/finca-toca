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
import { formatCOP, formatKg, formatKgNum, formatPct } from "@/modules/core/formato/numeros";
import { LineaBadge } from "../../components/linea-badge";
import { MermaBadge } from "../../components/merma-badge";
import { fechaCorta, parsearDecimal } from "../../procesos/lib/numero";
import { ARTICULO_PASO, type LotePasos } from "../../procesos/lib/pasos";
import { referenciaDelPaso, type ConfigMerma } from "../../procesos/lib/resumen";
import type { LoteParaProceso } from "../../procesos/types-planta";
import { etiquetaPresentacion } from "../../tipos/lib/productos";
import { registrarEmpaque } from "../actions/empaque.actions";
import {
  avisoMolido,
  cierreEmpaque,
  costoInsumosEmpaque,
  destinosDeLinea,
  enteroConMiles,
  ETIQUETA_DESTINO,
  faltantesDeInsumo,
  parsearUnidades,
  textoEmpacadas,
  textoFaltante,
  textoKgLinea,
  type AcumuladoTandas,
  type DestinoDiferencia,
  type FormaCafe,
  type LineaEmpaqueEntrada,
} from "../lib/empaque";
import type { TostadoIncluible } from "../queries/empaque.queries";
import { empaqueSchema } from "../schemas/empaque.schema";
import type { ConfigEmpaque, ResultadoEmpaque, TandaEmpaque } from "../types";

// Formulario de EMPAQUE (B-08), pensado para tablet: campos de 44 px como mínimo, teclado numérico y sin pistas que dependan
// del hover. Marca propia: tabla FIJA «Bolsas empacadas · {Tipo de café}» con una fila por presentación activa y las cuatro
// casillas (grano y molido, en bolsas) visibles desde el inicio, en cero; sin «Agregar línea». Terceros: líneas de bolsas del
// cliente de peso libre. El cierre pide el peso total en báscula (incluye el sobrante); de él sale la merma de tostión DE LA
// TANDA, que se asigna a su tostión (el empaque y la molienda no tienen merma). Sobrante: marca propia lo deja como «tostado
// sin empacar» (B-09); terceros se entrega a granel.
const CAMPO = "h-11 text-base";
const CELDA = "h-11 w-24 text-right text-base tabular-nums";

/** Empaque de un café REABIERTO (CO-33): sin báscula ni tanda; lo que llega es todo lo reabierto (o su molienda). */
export interface ReaperturaEmpaque {
  id: string;
  /** De dónde viene el café, para el texto de lo que llega: «Viene de la reapertura de 40 × Excelso 500 g (20 kg)». */
  origen: string;
}

interface EmpaqueFormProps {
  lote: Pick<LoteParaProceso["lote"], "id" | "linea" | "servicios" | "tipoCafe">;
  config: ConfigEmpaque;
  /** Tandas (tostiones) con café por empacar; vacío si el lote no lleva tostión o es un café reabierto. */
  tandas?: TandaEmpaque[];
  /** Acumulado de las tandas ya cerradas del lote. */
  acumuladoPrevio?: AcumuladoTandas | null;
  /** Referencias de merma del cliente (banda de tostión: 18 % ± 2). */
  merma?: ConfigMerma;
  /** Tostado sin empacar del mismo tipo de café (B-09): se ofrece incluirlo. */
  incluibles?: TostadoIncluible[];
  /** `YYYY-MM-DD` de hoy en la zona del cliente (lo calcula el servidor). */
  fechaHoy: string;
  /** Solo sin tanda (reapertura, o terceros sin tostión): lo que llega a empaque (kg). */
  pesoDisponibleInicial: number | null;
  /** Presente = se empaca un café reabierto en vez de una tanda. */
  reapertura?: ReaperturaEmpaque;
}

/** Fila de tamaño libre (terceros): el peso por bolsa se elige rápido (10 kg, 5 kg) o se escribe (Otro). */
interface FilaLibre {
  clave: number;
  /** `10` | `5` | `otro`. */
  tamano: string;
  kgTxt: string;
  forma: FormaCafe;
  unidadesTxt: string;
}

const clave = (g: number, forma: FormaCafe) => `${g}:${forma}`;

const MERMA_POR_DEFECTO: ConfigMerma = { referenciaTrillaPct: 19, referenciaTostionPct: { bajo: 18, medio: 18, alto: 18 }, toleranciaPts: 2 };

export function EmpaqueForm({ lote, config, tandas = [], acumuladoPrevio = null, merma = MERMA_POR_DEFECTO, incluibles = [], fechaHoy, pesoDisponibleInicial, reapertura }: EmpaqueFormProps) {
  const router = useRouter();
  const esMarcaPropia = lote.linea === "marca_propia";
  const _pasos: LotePasos = { linea: lote.linea, servicios: lote.servicios };
  void _pasos;
  const conTanda = tandas.length > 0 && !reapertura;

  const [fecha, setFecha] = useState(fechaHoy);
  const [tandaId, setTandaId] = useState<string>(tandas[0]?.procesoId ?? "");
  const [unidadesTxt, setUnidadesTxt] = useState<Record<string, string>>({});
  const [filas, setFilas] = useState<FilaLibre[]>([{ clave: 1, tamano: "10", kgTxt: "10", forma: "grano", unidadesTxt: "" }]);
  const [basculaTxt, setBasculaTxt] = useState("");
  const [sobranteForma, setSobranteForma] = useState<FormaCafe>("grano");
  const [incluirTxt, setIncluirTxt] = useState<Record<string, string>>({});
  const [destino, setDestino] = useState<DestinoDiferencia | null>(null);
  const [observaciones, setObservaciones] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tanda = tandas.find((t) => t.procesoId === tandaId) ?? tandas[0] ?? null;
  const nombreTipo = lote.tipoCafe ?? "Café";

  // Líneas de bolsas con lo que el operario escribió (solo las mayores que cero), en gramos enteros.
  const lineas: (LineaEmpaqueEntrada & { producto: string; bolsaCliente: boolean })[] = esMarcaPropia
    ? config.presentaciones.flatMap((p) =>
        (["grano", "molido"] as const).flatMap((forma) => {
          const unidades = parsearUnidades(unidadesTxt[clave(p.presentacionG, forma)]);
          if (unidades === null) return [];
          return [{ presentacionG: p.presentacionG, unidades, forma, bolsaCliente: false, producto: `${nombreTipo} ${etiquetaPresentacion(p.presentacionG)}${forma === "molido" ? " molido" : ""}` }];
        }),
      )
    : filas.flatMap((f) => {
        const kg = parsearDecimal(f.kgTxt);
        const unidades = parsearUnidades(f.unidadesTxt);
        if (kg === null || kg <= 0 || unidades === null) return [];
        const g = Math.round(kg * 1000);
        return [{ presentacionG: g, unidades, forma: f.forma, bolsaCliente: true, producto: etiquetaPresentacion(g) }];
      });

  const molidoKg = lineas.filter((l) => l.forma === "molido").reduce((a, l) => a + (l.presentacionG * l.unidades) / 1000, 0);
  const granoKg = lineas.filter((l) => l.forma === "grano").reduce((a, l) => a + (l.presentacionG * l.unidades) / 1000, 0);

  // Tostado sin empacar que se incluye (B-09): por defecto nada; el operario marca cuánto.
  const inclusiones = incluibles.flatMap((i) => {
    const kg = parsearDecimal(incluirTxt[`${i.loteId}:${i.forma}`] ?? "");
    return kg !== null && kg > 0 ? [{ loteOrigenId: i.loteId, forma: i.forma, kg }] : [];
  });
  const incluidoKg = inclusiones.reduce((a, i) => a + i.kg, 0);

  const bascula = parsearDecimal(basculaTxt);
  const llegaKg = conTanda ? (tanda?.entradaKg ?? null) : pesoDisponibleInicial;
  const cierre = cierreEmpaque({
    entradaKg: llegaKg ?? 0,
    lineas,
    basculaKg: conTanda ? bascula : (llegaKg ?? null),
    incluidoKg,
    acumuladoPrevio: conTanda ? acumuladoPrevio : null,
  });
  const basculaSupera = conTanda && bascula !== null && tanda !== null && bascula > tanda.entradaKg + 0.0005;
  const referenciaPct = tanda?.nivelTueste ? referenciaDelPaso("tostion", merma, tanda.nivelTueste) : merma.referenciaTostionPct.medio;

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

  // Costo de los insumos de lo que se va a empacar, con el precio vigente (B-13). El que queda registrado es el de este momento.
  const costoInsumos = esMarcaPropia
    ? costoInsumosEmpaque(
        config.presentaciones.map((p) => ({
          unidades: lineas.filter((l) => l.presentacionG === p.presentacionG).reduce((n, l) => n + l.unidades, 0),
          bolsaPrecio: p.bolsa?.precio ?? null,
          etiquetaPrecio: p.etiqueta?.precio ?? null,
        })),
      )
    : null;

  const aviso = esMarcaPropia && conTanda ? avisoMolido(molidoKg, tanda?.moliendaKg ?? null) : null;
  const destinosPosibles = destinosDeLinea(lote.linea);
  const necesitaDestino = Boolean(reapertura) && cierre.sobranteKg > 0;
  const sinBascula = conTanda && bascula === null;
  const deshabilitado = enviando || lineas.length === 0 || cierre.supera || basculaSupera || sinBascula || (necesitaDestino && destino === null) || (!conTanda && llegaKg === null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (cierre.supera) return setError("Las bolsas suman más que el peso en báscula. Revisar cantidades.");
    if (basculaSupera) return setError("El peso en báscula supera lo que entró a tostión. Revisar cantidades.");
    if (sinBascula) return setError("Indica el peso total en báscula.");
    if (necesitaDestino && destino === null) return setError("Elige el destino del sobrante");
    const parsed = empaqueSchema.safeParse({
      loteId: lote.id,
      fecha,
      origenProcesoId: conTanda ? (tanda?.procesoId ?? null) : null,
      reaperturaId: reapertura?.id ?? null,
      pesoBasculaKg: conTanda ? bascula : null,
      pesoEntradaKg: reapertura ? llegaKg : null,
      sobranteForma,
      incluirTostado: inclusiones,
      diferenciaDestino: necesitaDestino ? destino : null,
      lineas: lineas.map(({ presentacionG, unidades, bolsaCliente, forma }) => ({ presentacionG, unidades, bolsaCliente, forma })),
      observaciones,
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Revisa los campos");

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
    const sobrante = d.sobrante_kg > 0 ? `Sobrante ${formatKg(d.sobrante_kg)}: ${esMarcaPropia ? "queda tostado sin empacar" : "se entrega a granel"}.` : "";
    const costo = d.costo_insumos?.aplica ? ` Costo de insumos: ${formatCOP(d.costo_insumos.total)}${d.costo_insumos.completo ? "" : " (parcial: falta algún precio)"}.` : "";
    const mermaTanda = d.merma_tostion ? ` Merma de tostión de la tanda: ${formatPct(d.merma_tostion.merma_pct)}.` : "";
    toast.success(
      lote.linea === "servicio" && d.lote_estado === "listo"
        ? "Empaque registrado. Lote listo para entrega."
        : "Empaque registrado.",
      { description: `${textoEmpacadas(d.lineas.map((l) => ({ unidades: l.unidades, producto: l.producto ?? etiquetaPresentacion(l.presentacion_g) })))}. ${sobrante}${mermaTanda}${costo}`.trim() },
    );
    for (const a of d.advertencias) {
      toast.warning(`${a.articulo ?? "Un insumo"} quedó en ${enteroConMiles(a.stock_resultante)}: registra la compra que falta.`);
    }
    // Último servicio de un lote de terceros: se ofrece entregarlo ahora o dejarlo para después. El diálogo lo pinta la página
    // (`LoteListoDialog`) con `?listo=1`: este formulario se desmonta al revalidar la ruta.
    if (lote.linea === "servicio" && d.lote_estado === "listo") {
      router.replace(`/dashboard/cafe/planta/${lote.id}?listo=1`);
      return;
    }
    router.push("/dashboard/cafe/planta");
    router.refresh();
  }

  const textoOrigen = reapertura
    ? reapertura.origen
    : conTanda && tanda
      ? `Viene de ${ARTICULO_PASO.tostion} del ${fechaCorta(tanda.fecha)}`
      : "Café pendiente de empacar";
  const tostadoEstimadoKg = tanda && referenciaPct !== null ? Math.round(tanda.entradaKg * (1 - referenciaPct / 100) * 1000) / 1000 : null;

  const totalFila = (g: number) =>
    (["grano", "molido"] as const).reduce((a, f) => a + (parsearUnidades(unidadesTxt[clave(g, f)]) ?? 0) * g, 0) / 1000;
  const totalColumna = (f: FormaCafe) => config.presentaciones.reduce((a, p) => a + ((parsearUnidades(unidadesTxt[clave(p.presentacionG, f)]) ?? 0) * p.presentacionG) / 1000, 0);
  const totalBolsas = (f: FormaCafe) => config.presentaciones.reduce((a, p) => a + (parsearUnidades(unidadesTxt[clave(p.presentacionG, f)]) ?? 0), 0);

  return (
    <form onSubmit={guardar} noValidate className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-sm text-gray-500">
                Empaque <LineaBadge linea={lote.linea} />
              </p>
              {conTanda && tanda ? (
                <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-3">
                  <div>
                    <dt className="text-sm font-medium text-gray-600">Entró a tostión en esta tanda</dt>
                    <dd className="text-3xl font-bold tabular-nums text-gray-900">{formatKg(tanda.entradaKg)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-600">Molienda solicitada</dt>
                    <dd className="text-3xl font-bold tabular-nums text-gray-900">{tanda.moliendaKg !== null ? formatKg(tanda.moliendaKg) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-600">Tostado estimado</dt>
                    <dd className="text-3xl font-bold tabular-nums text-gray-900">{tostadoEstimadoKg !== null ? formatKg(tostadoEstimadoKg) : "—"}</dd>
                    <dd className="text-xs text-gray-500">Estimado</dd>
                  </div>
                </dl>
              ) : (
                <>
                  <p className="text-sm font-medium text-gray-600">Llega a empaque</p>
                  <p className="text-4xl font-bold tabular-nums text-gray-900" aria-live="polite">
                    {llegaKg !== null ? formatKg(llegaKg) : "—"}
                  </p>
                </>
              )}
              <p className="text-xs text-gray-500">{textoOrigen}</p>
            </div>
            <div className="w-full space-y-1.5 sm:w-56">
              <Label htmlFor="emp-fecha">Fecha del empaque</Label>
              <Input id="emp-fecha" type="date" max={fechaHoy} className={CAMPO} value={fecha} onChange={(e) => setFecha(e.target.value)} />
              {fecha !== fechaHoy && <p className="text-xs text-gray-500">Registro de un día anterior.</p>}
            </div>
          </div>

          {tandas.length > 1 && !reapertura && (
            <div className="space-y-1.5">
              <Label id="emp-tanda">Tanda</Label>
              <div role="radiogroup" aria-labelledby="emp-tanda" className="flex flex-wrap gap-2">
                {tandas.map((t) => (
                  <button
                    key={t.procesoId}
                    type="button"
                    role="radio"
                    aria-checked={tandaId === t.procesoId}
                    onClick={() => setTandaId(t.procesoId)}
                    className={cn("min-h-11 rounded-md border px-3 text-sm font-medium", tandaId === t.procesoId ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-800")}
                  >
                    Tostión del {fechaCorta(t.fecha)} · {formatKg(t.entradaKg)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm" aria-labelledby="emp-bolsas">
          <div>
            <h2 id="emp-bolsas" className="text-base font-semibold text-gray-800">
              {esMarcaPropia ? `Bolsas empacadas · ${nombreTipo}` : "Bolsas del cliente"}
            </h2>
            <p className="text-xs text-gray-500">
              {esMarcaPropia ? "Digitar solo lo empacado; lo demás queda en cero." : "Peso libre por bolsa; no descuenta insumos."}
            </p>
          </div>

          {esMarcaPropia ? (
            <>
              {config.presentaciones.length === 0 ? (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No hay bolsas activas en el inventario de insumos: crear una en Insumos para poder empacar.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[40rem] border-separate border-spacing-y-1.5" aria-label={`Bolsas empacadas · ${nombreTipo}`}>
                    <thead>
                      <tr className="text-left text-xs font-medium text-gray-500">
                        <th className="px-1">Presentación</th>
                        <th className="px-1 text-right">Grano</th>
                        <th className="px-1 text-right">bolsas</th>
                        <th className="px-1 text-right">Molido</th>
                        <th className="px-1 text-right">bolsas</th>
                        <th className="px-1 text-right">Kilos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {config.presentaciones.map((p) => {
                        const g = p.presentacionG;
                        const sinInsumo = !p.bolsa || !p.etiqueta;
                        return (
                          <tr key={g}>
                            <th scope="row" className="px-1 text-left text-sm font-semibold text-gray-800">
                              {etiquetaPresentacion(g)}
                              {sinInsumo && <span className="block text-xs font-normal text-amber-700">Falta bolsa o etiqueta activa</span>}
                            </th>
                            {(["grano", "molido"] as const).map((forma) => (
                              <td key={forma} colSpan={2} className="px-1 text-right">
                                <Input
                                  value={unidadesTxt[clave(g, forma)] ?? ""}
                                  onChange={(ev) => setUnidadesTxt((u) => ({ ...u, [clave(g, forma)]: ev.target.value }))}
                                  inputMode="numeric"
                                  autoComplete="off"
                                  enterKeyHint="next"
                                  placeholder="0"
                                  disabled={sinInsumo || enviando}
                                  aria-label={`${etiquetaPresentacion(g)} ${forma}, bolsas`}
                                  className={cn(CELDA, "ml-auto")}
                                />
                              </td>
                            ))}
                            <td className="px-1 text-right text-sm tabular-nums text-gray-700">{formatKgNum(totalFila(g))}</td>
                          </tr>
                        );
                      })}
                      <tr className="font-semibold text-gray-900">
                        <th scope="row" className="px-1 text-left text-sm">
                          Total
                        </th>
                        <td colSpan={2} className="px-1 text-right tabular-nums">
                          {formatKgNum(totalColumna("grano"))} kg · {enteroConMiles(totalBolsas("grano"))}
                        </td>
                        <td colSpan={2} className="px-1 text-right tabular-nums">
                          {formatKgNum(totalColumna("molido"))} kg · {enteroConMiles(totalBolsas("molido"))}
                        </td>
                        <td className="px-1 text-right tabular-nums">{formatKgNum(cierre.enBolsasKg)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-gray-500">Las presentaciones salen de Configuración. Una nueva presentación agrega una fila.</p>
              {faltantes.map((f) => (
                <p key={`${f.clase}-${f.presentacionG}`} className="flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  {textoFaltante(f)}
                </p>
              ))}
            </>
          ) : (
            <div className="space-y-2">
              {filas.map((f, i) => (
                <div key={f.clave} className="flex flex-wrap items-end gap-3 rounded-md border border-gray-200 p-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Peso por bolsa</Label>
                    <div role="radiogroup" aria-label="Peso por bolsa" className="inline-flex overflow-hidden rounded-md border border-gray-300">
                      {[
                        { v: "10", t: "10 kg" },
                        { v: "5", t: "5 kg" },
                        { v: "otro", t: "Otro (kg)" },
                      ].map((o) => (
                        <button
                          key={o.v}
                          type="button"
                          role="radio"
                          aria-checked={f.tamano === o.v}
                          onClick={() => setFilas((fs) => fs.map((x, j) => (j === i ? { ...x, tamano: o.v, kgTxt: o.v === "otro" ? "" : o.v } : x)))}
                          className={cn("min-h-11 px-3 text-sm font-medium", f.tamano === o.v ? "bg-gray-900 text-white" : "bg-white text-gray-700")}
                        >
                          {o.t}
                        </button>
                      ))}
                    </div>
                  </div>
                  {f.tamano === "otro" && (
                    <Input
                      value={f.kgTxt}
                      onChange={(ev) => setFilas((fs) => fs.map((x, j) => (j === i ? { ...x, kgTxt: ev.target.value } : x)))}
                      inputMode="decimal"
                      placeholder="kg"
                      aria-label="Peso por bolsa en kilos"
                      className={cn(CELDA, "w-28")}
                    />
                  )}
                  <div role="radiogroup" aria-label="Forma" className="inline-flex overflow-hidden rounded-md border border-gray-300">
                    {(["grano", "molido"] as const).map((forma) => (
                      <button
                        key={forma}
                        type="button"
                        role="radio"
                        aria-checked={f.forma === forma}
                        onClick={() => setFilas((fs) => fs.map((x, j) => (j === i ? { ...x, forma } : x)))}
                        className={cn("min-h-11 px-3 text-sm font-medium", f.forma === forma ? "bg-gray-900 text-white" : "bg-white text-gray-700")}
                      >
                        {forma === "grano" ? "Grano" : "Molido"}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Bolsas</Label>
                    <Input
                      value={f.unidadesTxt}
                      onChange={(ev) => setFilas((fs) => fs.map((x, j) => (j === i ? { ...x, unidadesTxt: ev.target.value } : x)))}
                      inputMode="numeric"
                      placeholder="0"
                      aria-label="Número de bolsas"
                      className={CELDA}
                    />
                  </div>
                  <p className="pb-3 text-sm tabular-nums text-gray-700">
                    {parsearDecimal(f.kgTxt) && parsearUnidades(f.unidadesTxt) ? `${textoKgLinea(Math.round((parsearDecimal(f.kgTxt) ?? 0) * 1000), parsearUnidades(f.unidadesTxt) ?? 0)} kg` : "—"}
                  </p>
                  {filas.length > 1 && (
                    <Button type="button" variant="ghost" className="h-11 w-11 p-0 text-gray-500 hover:text-red-600" aria-label="Quitar las bolsas" onClick={() => setFilas((fs) => fs.filter((_, j) => j !== i))}>
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" className="h-11" onClick={() => setFilas((fs) => [...fs, { clave: Math.max(0, ...fs.map((x) => x.clave)) + 1, tamano: "10", kgTxt: "10", forma: "grano", unidadesTxt: "" }])}>
                <Plus className="mr-2 h-4 w-4" />
                Agregar bolsas
              </Button>
            </div>
          )}
          {aviso && <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">{aviso}</p>}
        </section>

        {esMarcaPropia && incluibles.length > 0 && !reapertura && (
          <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm" aria-labelledby="emp-incluir">
            <h2 id="emp-incluir" className="text-base font-semibold text-gray-800">
              Tostado sin empacar
            </h2>
            {incluibles.map((i) => (
              <div key={`${i.loteId}:${i.forma}`} className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-gray-700">
                  Hay {formatKg(i.kg)} de {nombreTipo} en {i.forma === "grano" ? "grano" : "molido"} sin empacar ({i.codigo}). Incluir en este empaque.
                </p>
                <Input
                  value={incluirTxt[`${i.loteId}:${i.forma}`] ?? ""}
                  onChange={(ev) => setIncluirTxt((t) => ({ ...t, [`${i.loteId}:${i.forma}`]: ev.target.value }))}
                  inputMode="decimal"
                  placeholder="kg"
                  aria-label={`Kilos de ${i.codigo} ${i.forma} a incluir`}
                  className={cn(CELDA, "w-28")}
                />
                <Button type="button" variant="outline" className="h-11" onClick={() => setIncluirTxt((t) => ({ ...t, [`${i.loteId}:${i.forma}`]: String(Math.min(i.kg, i.forma === "grano" ? granoKg : molidoKg)).replace(".", ",") }))}>
                  Incluir todo
                </Button>
              </div>
            ))}
            <p className="text-xs text-gray-500">Lo incluido no cuenta como peso en báscula ni altera la merma de la tanda.</p>
          </section>
        )}

        <section className="space-y-1.5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <Label htmlFor="emp-obs">Observaciones (opcional)</Label>
          <Textarea id="emp-obs" rows={2} className="text-base" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
        </section>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm" aria-labelledby="emp-cierre">
          <h2 id="emp-cierre" className="text-base font-semibold text-gray-800">
            Cierre del empaque
          </h2>
          <dl className="space-y-2 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-600">En bolsas (kg)</dt>
              <dd className="font-semibold tabular-nums text-gray-900">{formatKgNum(cierre.enBolsasKg)}</dd>
            </div>
            {incluidoKg > 0 && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-gray-600">Incluido de tandas anteriores (kg)</dt>
                <dd className="font-semibold tabular-nums text-gray-900">{formatKgNum(incluidoKg)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-600">Sobrante (kg)</dt>
              <dd className={cn("font-semibold tabular-nums", cierre.supera ? "text-red-600" : "text-gray-900")}>{conTanda || reapertura ? formatKgNum(Math.max(cierre.sobranteKg, 0)) : "—"}</dd>
            </div>
          </dl>
          {cierre.sobranteKg > 0 && conTanda && (
            <p className="text-xs text-gray-500">{esMarcaPropia ? "Queda tostado sin empacar." : "Se entrega a granel."}</p>
          )}
          {esMarcaPropia && conTanda && cierre.sobranteKg > 0 && molidoKg > 0 && (
            <div role="radiogroup" aria-label="Forma del sobrante" className="inline-flex overflow-hidden rounded-md border border-gray-300">
              {(["grano", "molido"] as const).map((f) => (
                <button key={f} type="button" role="radio" aria-checked={sobranteForma === f} onClick={() => setSobranteForma(f)} className={cn("min-h-11 px-3 text-sm font-medium", sobranteForma === f ? "bg-gray-900 text-white" : "bg-white text-gray-700")}>
                  Sobrante en {f}
                </button>
              ))}
            </div>
          )}

          {conTanda && (
            <div className="space-y-1.5">
              <Label htmlFor="emp-bascula">Peso total en báscula (kg)</Label>
              <Input id="emp-bascula" value={basculaTxt} onChange={(e) => setBasculaTxt(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="Ej: 44,3" className={CAMPO} aria-invalid={basculaSupera} />
              <p className="text-xs text-gray-500">Incluye el sobrante.</p>
              {basculaSupera && tanda && <p role="alert" className="text-xs font-medium text-red-600">El peso en báscula supera lo que entró a tostión ({formatKg(tanda.entradaKg)}). Revisar cantidades.</p>}
            </div>
          )}

          {cierre.supera && (
            <p role="alert" className="text-sm font-medium text-red-600">
              Las bolsas suman más que el peso en báscula. Revisar cantidades.
            </p>
          )}

          {necesitaDestino && (
            <div className="space-y-1.5">
              <Label id="emp-destino">Destino del sobrante</Label>
              <div role="radiogroup" aria-labelledby="emp-destino" className="flex flex-wrap gap-2">
                {destinosPosibles.map((d) => (
                  <button key={d} type="button" role="radio" aria-checked={destino === d} onClick={() => setDestino(d)} className={cn("min-h-11 rounded-md border px-3 text-sm", destino === d ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-800")}>
                    {ETIQUETA_DESTINO[d]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {costoInsumos && lineas.length > 0 && (
            <p className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 text-sm">
              <span className="text-gray-600">Costo de insumos (bolsas y etiquetas)</span>
              <span className="font-semibold tabular-nums text-gray-900">
                {formatCOP(costoInsumos.total)}
                {!costoInsumos.completo && <span className="ml-2 text-xs font-normal text-amber-700">falta el precio de algún insumo (Insumos)</span>}
              </span>
            </p>
          )}

          {conTanda && (
            <div className="space-y-1 border-t border-gray-100 pt-3 text-sm">
              <p className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-gray-600">Merma de tostión · esta tanda</span>
                <span className="font-semibold tabular-nums text-gray-900">
                  {cierre.mermaPct !== null ? `${formatPct(cierre.mermaPct)}` : "—"}
                  {cierre.mermaPct !== null && <MermaBadge mermaPct={cierre.mermaPct} referenciaPct={referenciaPct} toleranciaPts={merma.toleranciaPts} tipo="tostion" conAyuda={false} className="ml-2" />}
                </span>
              </p>
              <p className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-gray-600">Acumulado del lote</span>
                <span className="tabular-nums text-gray-900">
                  {cierre.acumulado ? `${formatKgNum(cierre.acumulado.entradaKg)} → ${formatKgNum(cierre.acumulado.basculaKg)} kg · ${formatPct(cierre.acumulado.mermaPct)}` : "—"}
                </span>
              </p>
            </div>
          )}
        </section>

        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="space-y-3">
          <Button type="submit" className="h-12 w-full text-base" disabled={deshabilitado}>
            {enviando ? "Guardando…" : "Registrar empaque"}
          </Button>
          <Button asChild type="button" variant="outline" className="h-11 w-full">
            <Link href="/dashboard/cafe/planta">Cancelar</Link>
          </Button>
        </div>
      </aside>
    </form>
  );
}
