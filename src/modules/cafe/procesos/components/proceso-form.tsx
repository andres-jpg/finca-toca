"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MermaBadge } from "../../components/merma-badge";
import { textoKg } from "../../lotes/lib/avance";
import { etiquetaServicio, etiquetaTueste } from "../../lotes/lib/servicios";
import type { TipoProceso } from "../../lotes/types";
import { EmpaqueForm } from "../../empaque/components/empaque-form";
import type { TostadoIncluible } from "../../empaque/queries/empaque.queries";
import type { ConfigEmpaque, TandaEmpaque } from "../../empaque/types";
import { registrarProceso } from "../actions/procesos.actions";
import { bachesSinTocar, estadoBaches, filasPorPerfil, filasSugeridas, repartirKgPorPerfil, type BacheFila, type PerfilBache } from "../lib/baches-form";
import { decisionDeMolienda, estimarMolienda, textoEstimadoTostion, type ModoMolienda } from "../lib/molienda";
import { aTextoDecimal, fechaCorta, formatearPeso, formatearPorcentaje, parsearDecimal } from "../lib/numero";
import { ARTICULO_PASO, evaluarPasos, origenPeso, type LotePasos, type OrigenPlanta } from "../lib/pasos";
import { mermaEnVivo, textoEstadoLote, textoProcesoRegistrado, valorDelServicio } from "../lib/resumen";
import { NIVELES_TUESTE, procesoSchema, type ProcesoFormInput, type ProcesoValues } from "../schemas/proceso.schema";
import type { ConfigPlanta, LoteParaProceso, ProcesoHistorial } from "../types-planta";
import { CLASES_TUESTE } from "./nivel-tueste-chip";
import { MoliendaConfirmar } from "./molienda-confirmar";
import { MoliendaTarjeta } from "./molienda-tarjeta";
import { ResumenMerma } from "./resumen-merma";
import { TablaBaches } from "./tabla-baches";
import { COPY_TUESTE } from "@/modules/cafe/copy";

// Formulario de la planta, pensado para tablet: campos y botones de 44 px como mínimo, teclado decimal
// (`inputMode="decimal"`) con COMA aceptada en todos los pesos, y ninguna pista que dependa del hover. Todo en kilos (cada paso consume de una TANDA (el proceso previo) y la base valida que no pase de su saldo. La tostión se
// registra por tandas sin peso de salida («Kilos a tostar ahora»); el peso final y la merma de tostión salen del empaque.
const CAMPO = "h-11 text-base";

interface ProcesoPlantaFormProps {
  lote: LoteParaProceso["lote"];
  origenes: OrigenPlanta[];
  procesos: ProcesoHistorial[];
  config: ConfigPlanta;
  /** `YYYY-MM-DD` de hoy en la zona del cliente (lo calcula el servidor: el navegador puede estar en otra). */
  fechaHoy: string;
  /** owner/admin: ven el enlace a Tarifas y parámetros cuando falta una tarifa. */
  puedeConfigurarTarifas: boolean;
  /** Paso preseleccionado (el siguiente de la cola), `null` si no hay ninguno disponible. */
  tipoInicial: TipoProceso | null;
  /** Presentaciones, bolsas y etiquetas del empaque (en servicios a terceros va sin presentaciones: tamaños libres). */
  empaque?: ConfigEmpaque;
  /** Tostado sin empacar del mismo tipo de café (B-09). */
  incluibles?: TostadoIncluible[];
}

/** Selector de paso + formulario del paso elegido. */
export function ProcesoPlantaForm({ lote, origenes, procesos, config, fechaHoy, puedeConfigurarTarifas, tipoInicial, empaque, incluibles = [] }: ProcesoPlantaFormProps) {
  const lotePasos: LotePasos = useMemo(() => ({ linea: lote.linea, servicios: lote.servicios }), [lote.linea, lote.servicios]);
  const evaluaciones = useMemo(() => evaluarPasos(lotePasos, origenes), [lotePasos, origenes]);
  const [tipo, setTipo] = useState<TipoProceso | null>(tipoInicial);
  const evaluacion = evaluaciones.find((e) => e.tipo === tipo) ?? null;

  // Tandas del empaque: las tostiones con café por empacar, con su molienda solicitada.
  const tandas: TandaEmpaque[] = useMemo(() => {
    if (tipo !== "empaque" || !evaluacion) return [];
    return evaluacion.origenes.flatMap((o) => {
      const p = procesos.find((x) => x.id === o.procesoId && x.tipo === "tostion");
      if (!p) return [];
      const molienda = procesos.filter((m) => m.origenProcesoId === p.id && m.tipo === "molienda" && !m.anulado);
      return [
        {
          procesoId: p.id,
          fecha: p.fecha,
          entradaKg: p.pesoEntradaKg,
          nivelTueste: p.nivelTueste,
          moliendaKg: molienda.length > 0 ? Math.round(molienda.reduce((a, m) => a + m.pesoEntradaKg, 0) * 1000) / 1000 : null,
        },
      ];
    });
  }, [tipo, evaluacion, procesos]);
  const acumuladoPrevio = useMemo(() => {
    const cerradas = procesos.filter((p) => p.tipo === "tostion" && !p.anulado && p.pesoSalidaKg !== null);
    return cerradas.length === 0 ? null : { entradaKg: cerradas.reduce((a, p) => a + p.pesoEntradaKg, 0), basculaKg: cerradas.reduce((a, p) => a + (p.pesoSalidaKg ?? 0), 0) };
  }, [procesos]);

  return (
    <div className="space-y-6">
      <section className="space-y-3" aria-labelledby="planta-paso">
        <h2 id="planta-paso" className="text-base font-semibold text-gray-800">
          Paso a registrar
        </h2>
        <div role="radiogroup" aria-labelledby="planta-paso" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {evaluaciones.map((ev) => {
            const elegido = tipo === ev.tipo;
            return (
              <button
                key={ev.tipo}
                type="button"
                role="radio"
                aria-checked={elegido}
                aria-disabled={!ev.disponible}
                disabled={!ev.disponible}
                onClick={() => setTipo(ev.tipo)}
                className={cn(
                  "flex min-h-20 flex-col items-start justify-center gap-0.5 rounded-lg border px-4 py-3 text-left transition-colors",
                  elegido
                    ? "border-gray-900 bg-gray-900 text-white"
                    : ev.disponible
                      ? "border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
                      : "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400",
                )}
              >
                <span className="text-lg font-semibold">{etiquetaServicio(ev.tipo)}</span>
                <span className={cn("text-xs", elegido ? "text-gray-200" : "text-gray-500")}>
                  {ev.disponible ? textoKg(ev.tipo, ev.kgDisponible, ev.kgDisponible) : ev.motivo}
                </span>
              </button>
            );
          })}
        </div>
        {!tipo && <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">Este lote no tiene ningún paso por registrar ahora mismo.</p>}
      </section>

      {/* El empaque tiene su propio formulario: tabla de bolsas, báscula y merma de la tanda. */}
      {tipo === "empaque" && empaque && evaluacion && (
        <EmpaqueForm
          key={`empaque-${tandas.map((t) => t.procesoId).join(",")}`}
          lote={lote}
          config={empaque}
          tandas={tandas}
          acumuladoPrevio={acumuladoPrevio}
          merma={config.merma}
          incluibles={incluibles}
          fechaHoy={fechaHoy}
          pesoDisponibleInicial={evaluacion.kgDisponible}
        />
      )}

      {/* La molienda es una confirmación corta, sin pesos (B-07). */}
      {tipo === "molienda" && evaluacion && (
        <MoliendaConfirmar key={`molienda-${evaluacion.origenes.map((o) => o.procesoId).join(",")}`} loteId={lote.id} origenes={evaluacion.origenes.filter((o) => !o.conMolienda)} procesos={procesos} config={config} fechaHoy={fechaHoy} />
      )}

      {tipo && evaluacion && tipo !== "molienda" && !(tipo === "empaque" && empaque) && (
        <FormularioPaso
          key={tipo}
          lote={lote}
          config={config}
          tipo={tipo}
          origenes={evaluacion.origenes}
          fechaHoy={fechaHoy}
          puedeConfigurarTarifas={puedeConfigurarTarifas}
        />
      )}
    </div>
  );
}

interface FormularioPasoProps {
  lote: LoteParaProceso["lote"];
  config: ConfigPlanta;
  tipo: TipoProceso;
  /** Orígenes de los que este paso puede consumir (más de uno = elegir la tanda). */
  origenes: OrigenPlanta[];
  fechaHoy: string;
  puedeConfigurarTarifas: boolean;
}

// Forma mínima de los errores que deja el resolver para los baches (un mensaje general y uno por fila).
type ErroresBaches = { message?: string } & Record<number, Record<string, { message?: string } | undefined> | undefined>;

function FormularioPaso({ lote, config, tipo, origenes, fechaHoy, puedeConfigurarTarifas }: FormularioPasoProps) {
  const router = useRouter();
  const esTostion = tipo === "tostion";
  const esTrilla = tipo === "trilla";
  const esMaquila = lote.linea === "servicio";

  const [origenId, setOrigenId] = useState<string | null>(origenes[0]?.procesoId ?? null);
  const origen = origenes.find((o) => o.procesoId === origenId) ?? origenes[0] ?? null;
  // Pendiente: lo que queda por procesar en la tanda elegida (en molienda, lo tostado de esa tanda).
  const pendienteKg = origen ? (tipo === "molienda" ? origen.baseKg : origen.saldoKg) : null;
  // Perfil del lote (B-02): el primero de `lote_perfil_tostion` (en marca propia, el vigente del tipo al recibirlo; en maquila,
  // el pedido). Sin filas (lotes viejos) valen las columnas del lote, como antes.
  const perfilesLote = lote.perfiles ?? [];
  const primero = perfilesLote[0];
  const perfil: PerfilBache = {
    nivel: esTostion ? (primero?.nivel ?? (esMaquila ? lote.nivelTueste : null)) : null,
    tempC: primero?.tempC ?? lote.perfilTempC ?? null,
    tiempoMin: primero?.tiempoMin ?? lote.perfilTiempoMin ?? null,
  };
  // Con varios perfiles los baches se generan por perfil, con los kilos de cada uno escalados a la tanda.
  const variosPerfiles = esTostion && perfilesLote.length > 1;
  const filasDeTanda = (kg: number | null, p: PerfilBache): BacheFila[] =>
    variosPerfiles
      ? filasPorPerfil(repartirKgPorPerfil(perfilesLote.map((x) => ({ nivel: x.nivel, tempC: x.tempC, tiempoMin: x.tiempoMin, kg: x.kg })), kg), config.capacidadTostadoraKg)
      : filasSugeridas(kg, config.capacidadTostadoraKg, p);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ProcesoFormInput, unknown, ProcesoValues>({
    resolver: zodResolver(procesoSchema),
    defaultValues: {
      loteId: lote.id,
      tipo,
      fecha: fechaHoy,
      origenProcesoId: origen?.procesoId ?? null,
      pesoEntradaKg: aTextoDecimal(pendienteKg !== null ? Math.round(pendienteKg * 1000) / 1000 : null),
      pesoSalidaKg: "",
      humedadPct: "",
      densidadGl: "",
      // El lote ya trae su nivel de tueste (perfil pedido en maquila, perfil del tipo en marca propia); el operario puede cambiarlo.
      nivelTueste: esTostion ? perfil.nivel : null,
      // La tostión abre con los baches ya repartidos (capacidad de la tostadora, partes iguales) sobre los kilos a tostar.
      baches: esTostion ? filasDeTanda(pendienteKg, perfil) : [],
      observaciones: "",
    },
  });

  const pesoEntradaTxt = useWatch({ control, name: "pesoEntradaKg" });
  const pesoSalidaTxt = useWatch({ control, name: "pesoSalidaKg" });
  const baches = (useWatch({ control, name: "baches" }) ?? []) as BacheFila[];
  const nivelTueste = useWatch({ control, name: "nivelTueste" });
  const fecha = useWatch({ control, name: "fecha" });

  // Molienda de la tanda (B-06): terceros hereda lo pedido en la recepción (si contrata molienda); marca propia decide aquí.
  const mostrarMolienda = esTostion && (!esMaquila || lote.servicios.includes("molienda"));
  const solicitada = lote.moliendaSolicitada;
  const [moliendaModo, setMoliendaModo] = useState<ModoMolienda>(esMaquila ? (solicitada?.modo && solicitada.modo !== "ninguna" ? solicitada.modo : "todo") : "ninguna");
  const [moliendaKgTxt, setMoliendaKgTxt] = useState(esMaquila && solicitada?.modo === "kg" ? aTextoDecimal(solicitada.kg) : "");
  const moliendaEst = useMemo(
    () =>
      mostrarMolienda
        ? estimarMolienda({
            kgEntrada: parsearDecimal(pesoEntradaTxt ?? "") ?? 0,
            trilla: false,
            mermaTrillaPct: 0,
            mermaTostionPct: config.merma.referenciaTostionPct?.[nivelTueste ?? "medio"] ?? 0,
            modo: moliendaModo,
            kg: parsearDecimal(moliendaKgTxt),
          })
        : null,
    [mostrarMolienda, pesoEntradaTxt, config.merma.referenciaTostionPct, nivelTueste, moliendaModo, moliendaKgTxt],
  );

  const entradaKg = parsearDecimal(pesoEntradaTxt ?? "");
  const estado = estadoBaches(baches, entradaKg);
  const salidaKg = esTrilla ? parsearDecimal(pesoSalidaTxt ?? "") : null;
  const perfilActual: PerfilBache = { ...perfil, nivel: perfil.nivel ?? nivelTueste ?? null };

  // Solo la trilla tiene merma al registrarse; la de la tostión llega con su empaque y la molienda no tiene.
  const merma = esTrilla ? mermaEnVivo(tipo, entradaKg, salidaKg, config.merma, nivelTueste) : null;
  const valor = valorDelServicio(lote.linea, tipo, entradaKg, tipo === "empaque" ? null : config.tarifas[tipo]);
  const entradaSupera = entradaKg !== null && pendienteKg !== null && entradaKg > pendienteKg + Math.max(0.05, pendienteKg * 0.005);
  const textoOrigen = (() => {
    if (origen === null) return "No se pudo calcular el café disponible.";
    const previo = origenPeso(origen);
    return previo.previo
      ? `Viene de ${ARTICULO_PASO[previo.previo]} del ${previo.fecha ? fechaCorta(previo.fecha) : "—"}${origen.estimado ? " · estimado" : ""}`
      : "Café recibido";
  })();

  function repartir(kg: number | null = entradaKg) {
    const filas = filasDeTanda(kg, perfilActual);
    if (filas.length === 0) {
      toast.error("Indicar unos kilos a tostar mayores que cero para repartir los baches.");
      return;
    }
    setValue("baches", filas, { shouldDirty: true });
  }

  function cambiarOrigen(id: string | null) {
    const o = origenes.find((x) => x.procesoId === id);
    setOrigenId(id);
    setValue("origenProcesoId", id);
    if (!o) return;
    const kg = Math.round((tipo === "molienda" ? o.baseKg : o.saldoKg) * 1000) / 1000;
    setValue("pesoEntradaKg", aTextoDecimal(kg));
    if (esTostion) setValue("baches", filasDeTanda(kg, perfilActual), { shouldDirty: true });
  }

  const erroresBaches = errors.baches as unknown as ErroresBaches | undefined;
  const erroresFila = baches.map((_, i) => {
    const e = erroresBaches?.[i];
    return e?.pesoEntradaKg?.message ?? e?.temperaturaC?.message ?? e?.tiempoMin?.message ?? e?.observaciones?.message;
  });
  const errorBaches = erroresBaches?.message ?? erroresFila.find(Boolean);

  const onSubmit = async (values: ProcesoValues) => {
    if (mostrarMolienda && moliendaEst) {
      if (moliendaModo === "kg" && moliendaEst.molidoKg <= 0) {
        toast.error("Indicar los kilos a moler.");
        return;
      }
      if (moliendaEst.excede) {
        toast.error("La cantidad a moler supera el tostado estimado.");
        return;
      }
    }
    const decision = mostrarMolienda && moliendaEst ? decisionDeMolienda(moliendaModo, moliendaEst) : null;
    const r = await registrarProceso({ ...values, molienda: decision ? { modo: decision.modo, kg: decision.kg } : null });
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    const quedan = Math.max((pendienteKg ?? 0) - values.pesoEntradaKg, 0);
    toast.success(textoProcesoRegistrado(tipo, r.data.merma_pct, r.data.merma_kg, r.data.peso_entrada_kg), {
      description: textoEstadoLote(r.data.lote_estado, r.data.avance_texto, { tipo, pendienteKg: quedan }),
    });
    if (r.data.desvio) {
      toast.warning(
        r.data.desvio_sentido === "baja"
          ? "La merma quedó por debajo de la referencia: verificar el peso y el desarrollo del tueste."
          : "La merma quedó por encima de la referencia: revisar el pesaje.",
      );
    }
    router.push("/dashboard/cafe/planta");
    router.refresh();
  };
  // «Sin molienda» (o un lote sin ella) manda la tanda directo a «Por empacar».
  const hayMolienda = mostrarMolienda && moliendaModo !== "ninguna";
  const textoBoton = esTostion
    ? `Registrar tostión → ${hayMolienda ? "Por moler" : "Por empacar"}`
    : esTrilla
      ? "Registrar trilla → Por tostar"
      : `Registrar ${etiquetaServicio(tipo).toLowerCase()}`;
  const onInvalid = () => toast.error("Revisar los campos marcados en rojo.");

  const textoUnPerfil = [lote.tipoCafe ?? null, nivelTueste ? etiquetaTueste(nivelTueste) : null, perfil.tempC != null ? `${formatearPeso(perfil.tempC)} °C` : null, perfil.tiempoMin != null ? `${formatearPeso(perfil.tiempoMin)} min` : null].filter(Boolean).join(" · ");
  // Varios perfiles (B-02): una línea por perfil con sus kilos.
  const textoPerfil = variosPerfiles
    ? perfilesLote
        .map((p, k) => `${COPY_TUESTE.perfilN(k + 1)}: ${[etiquetaTueste(p.nivel), p.tempC != null ? `${formatearPeso(p.tempC)} °C` : null, p.tiempoMin != null ? `${formatearPeso(p.tiempoMin)} min` : null, `${formatearPeso(p.kg)} kg`].filter(Boolean).join(" · ")}`)
        .join("  |  ")
    : textoUnPerfil;

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} noValidate className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        {origenes.length > 1 && (
          <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Tanda</h2>
              <p className="text-xs text-gray-500">Hay más de una tanda con café por procesar: elegir de cuál sale este paso.</p>
            </div>
            <div role="radiogroup" aria-label="Tanda de origen" className="flex flex-wrap gap-2">
              {origenes.map((o) => (
                <button
                  key={o.procesoId ?? "raiz"}
                  type="button"
                  role="radio"
                  aria-checked={origenId === o.procesoId}
                  onClick={() => cambiarOrigen(o.procesoId)}
                  className={cn("min-h-11 rounded-md border px-3 text-sm font-medium", origenId === o.procesoId ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-800")}
                >
                  {etiquetaServicio(o.tipo ?? "trilla")} del {o.fecha ? fechaCorta(o.fecha) : "—"} · {formatearPeso(tipo === "molienda" ? o.baseKg : o.saldoKg)} kg
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            {esTostion && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-gray-700">Pendiente por tostar (kg)</p>
                <p className="flex h-11 items-center text-lg font-semibold tabular-nums text-gray-900">{pendienteKg !== null ? formatearPeso(pendienteKg) : "—"}</p>
                <p className="text-xs text-gray-500">{textoOrigen}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="proc-entrada">{esTostion ? "Kilos a tostar ahora" : esTrilla ? "Entrada: pergamino del lote (kg)" : "Kilos a moler (kg)"}</Label>
              <Input
                id="proc-entrada"
                inputMode="decimal"
                autoComplete="off"
                placeholder="Ej: 54,0"
                className={CAMPO}
                aria-invalid={Boolean(errors.pesoEntradaKg)}
                readOnly={esTrilla}
                {...register("pesoEntradaKg", {
                  onBlur: () => {
                    // Cambió el peso: se vuelven a repartir los baches salvo que el operario ya los haya ajustado.
                    if (esTostion && !variosPerfiles && bachesSinTocar((getValues("baches") ?? []) as BacheFila[], perfilActual)) repartir(parsearDecimal(getValues("pesoEntradaKg") as string));
                  },
                })}
              />
              {errors.pesoEntradaKg && <p className="text-xs text-red-500">{errors.pesoEntradaKg.message}</p>}
              {!esTostion && <p className="text-xs text-gray-500">{pendienteKg === null ? textoOrigen : `${textoOrigen}: ${formatearPeso(pendienteKg)} kg`}</p>}
              {esTostion && <p className="text-xs text-gray-500">Permite tandas parciales.</p>}
              {entradaSupera && pendienteKg !== null && (
                <p role="alert" className="text-xs font-medium text-red-600">
                  Supera el café disponible ({formatearPeso(pendienteKg)} kg): el sistema no lo aceptará.
                </p>
              )}
              {!esTrilla && pendienteKg !== null && entradaKg !== pendienteKg && (
                <Button type="button" variant="outline" className="h-11" onClick={() => { setValue("pesoEntradaKg", aTextoDecimal(Math.round(pendienteKg * 1000) / 1000)); if (esTostion) repartir(pendienteKg); }}>
                  Usar todo el pendiente ({formatearPeso(pendienteKg)} kg)
                </Button>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="proc-fecha">Fecha del proceso</Label>
              <Input id="proc-fecha" type="date" max={fechaHoy} className={CAMPO} {...register("fecha")} />
              {errors.fecha && <p className="text-xs text-red-500">{errors.fecha.message}</p>}
              {fecha !== fechaHoy && <p className="text-xs text-gray-500">Registro de un día anterior.</p>}
            </div>
          </div>
        </section>

        {esTostion ? (
          <section className="space-y-5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="space-y-1.5">
              <Label id="proc-tueste-label">{COPY_TUESTE.nivelDeTueste}</Label>
              <Controller
                control={control}
                name="nivelTueste"
                render={({ field }) => (
                  <div role="radiogroup" aria-labelledby="proc-tueste-label" className="grid grid-cols-3 gap-2">
                    {NIVELES_TUESTE.map((n) => (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={field.value === n}
                        onClick={() => {
                          field.onChange(n);
                          // El nivel de la tostión es el de todos los baches que no se hayan ajustado a mano.
                          if (bachesSinTocar(baches, perfilActual)) setValue("baches", baches.map((b) => ({ ...b, nivel: n })), { shouldDirty: true });
                        }}
                        className={cn(
                          "min-h-12 rounded-md border px-3 text-base font-semibold transition-colors",
                          field.value === n ? CLASES_TUESTE[n] : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
                          field.value === n && "ring-2 ring-offset-1 ring-gray-900",
                        )}
                      >
                        {etiquetaTueste(n)}
                      </button>
                    ))}
                  </div>
                )}
              />
              {errors.nivelTueste && <p className="text-xs text-red-500">{errors.nivelTueste.message}</p>}
              {textoPerfil && (
                <p className="text-sm text-gray-700">
                  <span className="font-medium">{esMaquila ? `${COPY_TUESTE.perfilDeTueste}: ` : ""}</span>{textoPerfil}
                </p>
              )}
            </div>

            <Controller
              control={control}
              name="baches"
              render={({ field }) => (
                <TablaBaches
                  filas={(field.value ?? []) as BacheFila[]}
                  onChange={(filas) => field.onChange(filas)}
                  entradaKg={entradaKg}
                  capacidadKg={config.capacidadTostadoraKg}
                  onSugerir={() => repartir()}
                  error={errorBaches}
                  erroresFila={erroresFila}
                  disabled={isSubmitting}
                  perfil={perfilActual}
                  conColumnaPerfil={baches.some((b) => b.perfil !== null)}
                />
              )}
            />
            <p className="text-xs text-gray-500">
              Los baches toman el perfil de tueste de {lote.tipoCafe ?? "la maquila"}. El peso final se registra en empaque; allí se calcula la merma de tostión.
            </p>
          </section>
        ) : esTrilla ? (
          <section className="grid gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="proc-salida">Peso final (kg)</Label>
              <Input id="proc-salida" inputMode="decimal" autoComplete="off" placeholder="Ej: 202,5" className={CAMPO} aria-invalid={Boolean(errors.pesoSalidaKg)} {...register("pesoSalidaKg")} />
              {errors.pesoSalidaKg && <p role="alert" className="text-xs text-red-500">{errors.pesoSalidaKg.message}</p>}
              <p className="text-xs text-gray-500">Lo que pesa el café al terminar la trilla; es lo que entra a tostión.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proc-humedad">Humedad (%)</Label>
              <Input id="proc-humedad" inputMode="decimal" autoComplete="off" placeholder="Ej: 11,0" className={CAMPO} aria-invalid={Boolean(errors.humedadPct)} {...register("humedadPct")} />
              {errors.humedadPct && <p className="text-xs text-red-500">{errors.humedadPct.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proc-densidad">Densidad (g/L)</Label>
              <Input id="proc-densidad" inputMode="decimal" autoComplete="off" placeholder="Ej: 720" className={CAMPO} aria-invalid={Boolean(errors.densidadGl)} {...register("densidadGl")} />
              {errors.densidadGl && <p className="text-xs text-red-500">{errors.densidadGl.message}</p>}
            </div>
          </section>
        ) : (
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-600">La molienda no lleva peso de salida ni merma: se registra como confirmación de lo molido.</p>
          </section>
        )}

        {mostrarMolienda && (
          <MoliendaTarjeta
            idBase="proc-molienda"
            modo={moliendaModo}
            onModo={setMoliendaModo}
            kgTxt={moliendaKgTxt}
            onKgTxt={setMoliendaKgTxt}
            estimacion={moliendaEst}
            textoEstimado={textoEstimadoTostion}
            conSinMolienda
            tarifaKg={esMaquila ? config.tarifas.molienda : null}
          />
        )}

        <section className="space-y-1.5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <Label htmlFor="proc-obs">Observaciones (opcional)</Label>
          <Textarea id="proc-obs" rows={2} className="text-base" {...register("observaciones")} />
          {errors.observaciones && <p className="text-xs text-red-500">{errors.observaciones.message}</p>}
        </section>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <ResumenMerma
          tipo={tipo}
          merma={merma}
          valor={valor}
          empaqueIncluido={false}
          fechaDistintaDeHoy={fecha !== fechaHoy}
          puedeConfigurarTarifas={puedeConfigurarTarifas}
          sinMerma={esTostion ? "El peso final se registra en empaque; allí se calcula la merma de tostión." : tipo === "molienda" ? "La molienda no tiene merma." : null}
        />
        {esTostion && (
          <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-sm" aria-live="polite">
            {estado.cuadra && entradaKg !== null && pendienteKg !== null ? (
              <>Quedarán <span className="font-semibold tabular-nums">{formatearPeso(Math.max(pendienteKg - entradaKg, 0))} kg</span> por tostar.</>
            ) : (
              "Los baches deben sumar los kilos a tostar."
            )}
          </p>
        )}
        {/* En pantalla ancha el botón vive aquí; en tablet va en la barra fija de abajo. */}
        <div className="hidden space-y-4 xl:block">
          <Button type="submit" className="h-12 w-full text-base" disabled={isSubmitting || pendienteKg === null}>
            {isSubmitting ? "Guardando…" : textoBoton}
          </Button>
          <Button asChild type="button" variant="outline" className="h-11 w-full">
            <Link href="/dashboard/cafe/planta">Cancelar</Link>
          </Button>
        </div>
      </aside>

      {/* Tablet (< 1280 px): una sola columna, así que el botón de guardar queda fijo al pie. */}
      <div className="sticky bottom-0 z-10 flex flex-row-reverse items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-lg xl:hidden">
        <p className="min-w-0 text-right text-sm text-gray-600">
          {merma ? (
            <>
              <span className="text-xl font-bold tabular-nums text-gray-900">{formatearPorcentaje(merma.mermaPct)} %</span>{" "}
              <span className="tabular-nums">{formatearPeso(merma.mermaKg)} kg</span>
              <MermaBadge mermaPct={merma.mermaPct} referenciaPct={merma.referenciaPct} toleranciaPts={merma.toleranciaPts} tipo={tipo} conAyuda={false} className="ml-2" />
            </>
          ) : esTostion ? (
            <span className="tabular-nums">{entradaKg !== null ? `${formatearPeso(entradaKg)} kg a tostar` : "—"}</span>
          ) : (
            "Sin merma"
          )}
        </p>
        <Button type="submit" className="h-12 shrink-0 px-6 text-base" disabled={isSubmitting || pendienteKg === null}>
          {isSubmitting ? "Guardando…" : textoBoton}
        </Button>
      </div>
    </form>
  );
}
