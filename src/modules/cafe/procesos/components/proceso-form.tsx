"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { etiquetaServicio, etiquetaTueste } from "../../lotes/lib/servicios";
import type { TipoProceso } from "../../lotes/types";
import { consultarPesoDisponible, registrarProceso } from "../actions/procesos.actions";
import { estadoBaches, filasSugeridas, type BacheFila } from "../lib/baches-form";
import { aTextoDecimal, fechaCorta, formatearPeso, formatearPorcentaje, parsearDecimal } from "../lib/numero";
import { ARTICULO_PASO, evaluarPasos, origenPeso, type LotePasos } from "../lib/pasos";
import { mermaEnVivo, textoEstadoLote, textoProcesoRegistrado, valorDelServicio } from "../lib/resumen";
import {
  NIVELES_TUESTE,
  procesoSchema,
  type ProcesoFormInput,
  type ProcesoValues,
} from "../schemas/proceso.schema";
import type { BultoPlanta, ConfigPlanta, LoteParaProceso } from "../types-planta";
import { EmpaqueForm } from "../../empaque/components/empaque-form";
import type { ConfigEmpaque } from "../../empaque/types";
import { CLASES_TUESTE } from "./nivel-tueste-chip";
import { ResumenMerma } from "./resumen-merma";
import { SelectorBultos } from "./selector-bultos";
import { TablaBaches } from "./tabla-baches";

// Formulario de la planta, pensado para tablet: campos y botones de 44 px como mínimo, teclado decimal
// (`inputMode="decimal"`) con COMA aceptada en todos los pesos, y ninguna pista que dependa del hover. La merma
// y el valor se calculan en vivo con las mismas funciones que las columnas generadas de la base; el desvío
// avisa pero NO bloquea. El orden, los pesos y los baches los vuelve a validar `cafe.registrar_proceso`.
const CAMPO = "h-11 text-base";

interface ProcesoPlantaFormProps {
  lote: LoteParaProceso["lote"];
  bultos: BultoPlanta[];
  config: ConfigPlanta;
  /** `YYYY-MM-DD` de hoy en la zona del cliente (lo calcula el servidor: el navegador puede estar en otra). */
  fechaHoy: string;
  /** owner/admin: ven el enlace a Tarifas y parámetros cuando falta una tarifa. */
  puedeConfigurarTarifas: boolean;
  /** Paso preseleccionado (el siguiente de la cola), `null` si no hay ninguno disponible. */
  tipoInicial: TipoProceso | null;
  bultoIdsIniciales: string[];
  pesoDisponibleInicial: number | null;
  /** Presentaciones, bolsas y etiquetas: solo lo pide el empaque de marca propia (CO-30). */
  empaque?: ConfigEmpaque;
}

interface PasoElegido {
  tipo: TipoProceso;
  bultoIds: string[];
  pesoDisponible: number | null;
}

/** Selector de paso + formulario del paso elegido. */
export function ProcesoPlantaForm({
  lote,
  bultos,
  config,
  fechaHoy,
  puedeConfigurarTarifas,
  tipoInicial,
  bultoIdsIniciales,
  pesoDisponibleInicial,
  empaque,
}: ProcesoPlantaFormProps) {
  const lotePasos: LotePasos = useMemo(() => ({ linea: lote.linea, servicios: lote.servicios }), [lote.linea, lote.servicios]);
  const evaluaciones = useMemo(() => evaluarPasos(lotePasos, bultos), [lotePasos, bultos]);
  const [paso, setPaso] = useState<PasoElegido | null>(
    tipoInicial ? { tipo: tipoInicial, bultoIds: bultoIdsIniciales, pesoDisponible: pesoDisponibleInicial } : null,
  );
  const [cambiando, setCambiando] = useState(false);

  // Cambiar de paso: se preselecciona todo lo elegible y se trae el peso disponible ANTES de montar el
  // formulario nuevo (que arranca de cero con su `key`).
  async function elegirPaso(tipo: TipoProceso) {
    const ev = evaluaciones.find((e) => e.tipo === tipo);
    if (cambiando || !ev?.disponible || paso?.tipo === tipo) return;
    setCambiando(true);
    const r = await consultarPesoDisponible(lote.id, tipo, ev.elegibles);
    setCambiando(false);
    if (!r.ok) toast.error(r.message);
    setPaso({ tipo, bultoIds: ev.elegibles, pesoDisponible: r.ok ? r.data : null });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3" aria-labelledby="planta-paso">
        <h2 id="planta-paso" className="text-base font-semibold text-gray-800">
          Paso a registrar
        </h2>
        <div role="radiogroup" aria-labelledby="planta-paso" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {evaluaciones.map((ev) => {
            const elegido = paso?.tipo === ev.tipo;
            return (
              <button
                key={ev.tipo}
                type="button"
                role="radio"
                aria-checked={elegido}
                aria-disabled={!ev.disponible}
                disabled={!ev.disponible || cambiando}
                onClick={() => elegirPaso(ev.tipo)}
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
                <span className={cn("text-xs", elegido ? "text-gray-200" : ev.disponible ? "text-gray-500" : "text-gray-500")}>
                  {ev.disponible
                    ? `${ev.elegibles.length} de ${ev.total} ${ev.total === 1 ? "bulto" : "bultos"} por procesar`
                    : ev.motivo}
                </span>
              </button>
            );
          })}
        </div>
        {!paso && (
          <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
            Este lote no tiene ningún paso por registrar ahora mismo.
          </p>
        )}
      </section>

      {/* El empaque de marca propia mueve inventario (bolsas, etiquetas, producto terminado): otro formulario. */}
      {paso && paso.tipo === "empaque" && lote.linea === "marca_propia" && empaque && (
        <EmpaqueForm
          key={paso.tipo}
          lote={lote}
          bultos={bultos}
          config={empaque}
          fechaHoy={fechaHoy}
          bultoIdsIniciales={paso.bultoIds}
          pesoDisponibleInicial={paso.pesoDisponible}
        />
      )}

      {paso && !(paso.tipo === "empaque" && lote.linea === "marca_propia") && (
        <FormularioPaso
          key={paso.tipo}
          lote={lote}
          lotePasos={lotePasos}
          bultos={bultos}
          config={config}
          tipo={paso.tipo}
          fechaHoy={fechaHoy}
          puedeConfigurarTarifas={puedeConfigurarTarifas}
          bultoIdsIniciales={paso.bultoIds}
          pesoDisponibleInicial={paso.pesoDisponible}
        />
      )}
    </div>
  );
}

interface FormularioPasoProps {
  lote: LoteParaProceso["lote"];
  lotePasos: LotePasos;
  bultos: BultoPlanta[];
  config: ConfigPlanta;
  tipo: TipoProceso;
  fechaHoy: string;
  puedeConfigurarTarifas: boolean;
  bultoIdsIniciales: string[];
  pesoDisponibleInicial: number | null;
}

// Forma mínima de los errores que deja el resolver para los baches (un mensaje general y uno por fila).
type ErroresBaches = { message?: string } & Record<number, Record<string, { message?: string } | undefined> | undefined>;

function FormularioPaso({
  lote,
  lotePasos,
  bultos,
  config,
  tipo,
  fechaHoy,
  puedeConfigurarTarifas,
  bultoIdsIniciales,
  pesoDisponibleInicial,
}: FormularioPasoProps) {
  const router = useRouter();
  const unSoloBulto = bultos.length === 1;
  const esTostion = tipo === "tostion";
  const esMaquila = lote.linea === "servicio";

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<ProcesoFormInput, unknown, ProcesoValues>({
    resolver: zodResolver(procesoSchema),
    defaultValues: {
      loteId: lote.id,
      tipo,
      fecha: fechaHoy,
      bultoIds: bultoIdsIniciales,
      pesoEntradaKg: aTextoDecimal(pesoDisponibleInicial),
      pesoSalidaKg: "",
      // En maquila el lote ya trae su nivel de tueste; en marca propia lo decide el operario.
      nivelTueste: esTostion && esMaquila ? lote.nivelTueste : null,
      baches: [],
      observaciones: "",
    },
  });

  const bultoIds = useWatch({ control, name: "bultoIds" }) ?? [];
  const pesoEntradaTxt = useWatch({ control, name: "pesoEntradaKg" });
  const pesoSalidaTxt = useWatch({ control, name: "pesoSalidaKg" });
  const baches = (useWatch({ control, name: "baches" }) ?? []) as BacheFila[];
  const nivelTueste = useWatch({ control, name: "nivelTueste" });
  const fecha = useWatch({ control, name: "fecha" });

  // Peso disponible para la selección actual (RPC `cafe.peso_disponible`). Se consulta al CAMBIAR la selección
  // (evento), y una respuesta tardía de una selección anterior se descarta.
  const [pesoDisp, setPesoDisp] = useState<number | null>(pesoDisponibleInicial);
  const [cargandoPeso, setCargandoPeso] = useState(false);
  const peticion = useRef(0);

  async function cambiarSeleccion(ids: string[]) {
    setValue("bultoIds", ids);
    clearErrors("bultoIds");
    const esta = ++peticion.current;
    if (ids.length === 0) {
      setCargandoPeso(false);
      setPesoDisp(null);
      setValue("pesoEntradaKg", "");
      return;
    }
    setCargandoPeso(true);
    const r = await consultarPesoDisponible(lote.id, tipo, ids);
    if (esta !== peticion.current) return;
    setCargandoPeso(false);
    if (!r.ok) {
      toast.error(r.message);
      setPesoDisp(null);
      return;
    }
    setPesoDisp(r.data);
    setValue("pesoEntradaKg", aTextoDecimal(r.data));
  }

  const entradaKg = parsearDecimal(pesoEntradaTxt ?? "");
  const estadoDeBaches = estadoBaches(baches, entradaKg);
  const bachesConSalida = baches.length > 0 && baches.every((f) => parsearDecimal(f.pesoSalidaKg) !== null);
  const salidaKg = esTostion ? (bachesConSalida ? estadoDeBaches.sumaSalidaKg : null) : parsearDecimal(pesoSalidaTxt ?? "");

  const merma = mermaEnVivo(tipo, entradaKg, salidaKg, config.merma);
  const valor = valorDelServicio(lote.linea, tipo, entradaKg, tipo === "empaque" ? null : config.tarifas[tipo]);
  const salidaSupera = entradaKg !== null && salidaKg !== null && salidaKg > entradaKg;
  const entradaSupera = entradaKg !== null && pesoDisp !== null && entradaKg > pesoDisp * 1.005;

  const seleccionados = bultos.filter((b) => bultoIds.includes(b.id));
  const origen = origenPeso(lotePasos, tipo, seleccionados);
  const textoOrigen =
    pesoDisp === null
      ? "No se pudo calcular el peso disponible: escríbelo."
      : origen.previo
        ? `Viene de ${ARTICULO_PASO[origen.previo]} del ${origen.fechas.map((f) => fechaCorta(f)).join(" y ") || "—"}: ${formatearPeso(pesoDisp)} kg`
        : `Suma de los bultos elegidos: ${formatearPeso(pesoDisp)} kg`;

  function sugerirBaches() {
    const filas = filasSugeridas(entradaKg, config.capacidadTostadoraKg);
    if (filas.length === 0) {
      toast.error("Indica un peso de entrada mayor que cero para sugerir los baches.");
      return;
    }
    setValue("baches", filas, { shouldDirty: true });
    toast.info(`${filas.length} ${filas.length === 1 ? "bache" : "baches"} sugeridos: ya puedes pesar la salida de cada uno.`);
  }

  const erroresBaches = errors.baches as unknown as ErroresBaches | undefined;
  const erroresFila = baches.map((_, i) => {
    const e = erroresBaches?.[i];
    return e?.pesoEntradaKg?.message ?? e?.pesoSalidaKg?.message ?? e?.temperaturaC?.message ?? e?.observaciones?.message;
  });
  const errorBaches = erroresBaches?.message ?? erroresFila.find(Boolean);

  const onSubmit = async (values: ProcesoValues) => {
    if (!unSoloBulto && values.bultoIds.length === 0) {
      setError("bultoIds", { message: "Elige al menos un bulto" });
      return;
    }
    const r = await registrarProceso(values);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    const procesados = bultos.filter((b) => b.pasos.includes(tipo)).length + values.bultoIds.length;
    toast.success(textoProcesoRegistrado(tipo, r.data.merma_pct, r.data.merma_kg), {
      description: textoEstadoLote(r.data.lote_estado, r.data.avance_texto, { tipo, procesados, total: bultos.length }),
    });
    if (r.data.desvio) toast.warning("La merma se desvió de la referencia: el proceso quedó marcado para revisión.");
    router.push("/dashboard/cafe/planta");
    router.refresh();
  };
  const onInvalid = () => toast.error("Revisa los campos marcados en rojo.");

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} noValidate className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        {!unSoloBulto && (
          <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Bultos</h2>
              <p className="text-xs text-gray-500">Puedes procesar solo una parte del lote hoy y el resto otro día.</p>
            </div>
            <SelectorBultos
              lote={lotePasos}
              tipo={tipo}
              bultos={bultos}
              seleccionados={bultoIds}
              onChange={cambiarSeleccion}
              disabled={isSubmitting}
            />
            {errors.bultoIds && <p className="text-xs text-red-500">{errors.bultoIds.message as string}</p>}
          </section>
        )}

        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="proc-entrada">Peso de entrada (kg)</Label>
              <Input
                id="proc-entrada"
                inputMode="decimal"
                autoComplete="off"
                placeholder="Ej: 405,5"
                className={CAMPO}
                aria-invalid={Boolean(errors.pesoEntradaKg)}
                {...register("pesoEntradaKg")}
              />
              {errors.pesoEntradaKg && <p className="text-xs text-red-500">{errors.pesoEntradaKg.message}</p>}
              <p className="text-xs text-gray-500" aria-live="polite">
                {cargandoPeso ? "Calculando el peso disponible…" : textoOrigen}
              </p>
              {entradaSupera && pesoDisp !== null && (
                <p role="alert" className="text-xs font-medium text-red-600">
                  Supera el peso disponible ({formatearPeso(pesoDisp)} kg): el sistema no lo aceptará.
                </p>
              )}
              {pesoDisp !== null && entradaKg !== pesoDisp && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => setValue("pesoEntradaKg", aTextoDecimal(pesoDisp))}
                >
                  Usar el disponible ({formatearPeso(pesoDisp)} kg)
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
              <Label id="proc-tueste-label">Nivel de tueste</Label>
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
                        onClick={() => field.onChange(n)}
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
              {!nivelTueste && !errors.nivelTueste && (
                <p className="text-xs text-gray-500">
                  {esMaquila ? "El lote no trae nivel de tueste: elígelo." : "Obligatorio en marca propia."}
                </p>
              )}
              {esMaquila && lote.nivelTueste && nivelTueste === lote.nivelTueste && (
                <p className="text-xs text-gray-500">Es el nivel que pidió el cliente.</p>
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
                  onSugerir={sugerirBaches}
                  error={errorBaches}
                  erroresFila={erroresFila}
                  disabled={isSubmitting}
                />
              )}
            />
          </section>
        ) : (
          <section className="space-y-1.5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <Label htmlFor="proc-salida">Peso de salida (kg)</Label>
            <Input
              id="proc-salida"
              inputMode="decimal"
              autoComplete="off"
              placeholder="Ej: 332"
              className={cn(CAMPO, "sm:max-w-xs")}
              aria-invalid={Boolean(errors.pesoSalidaKg) || salidaSupera}
              {...register("pesoSalidaKg")}
            />
            {errors.pesoSalidaKg && <p className="text-xs text-red-500">{errors.pesoSalidaKg.message}</p>}
            {salidaSupera && !errors.pesoSalidaKg && <p className="text-xs text-red-500">La salida no puede superar la entrada.</p>}
            <p className="text-xs text-gray-500">Lo que pesa el café al terminar este paso.</p>
          </section>
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
          empaqueIncluido={esMaquila && tipo === "empaque"}
          fechaDistintaDeHoy={fecha !== fechaHoy}
          puedeConfigurarTarifas={puedeConfigurarTarifas}
        />
        {/* En pantalla ancha el botón vive aquí; en tablet va en la barra fija de abajo (a la izquierda: los avisos salen a la derecha). */}
        <div className="hidden space-y-4 xl:block">
          <Button type="submit" className="h-12 w-full text-base" disabled={isSubmitting || cargandoPeso}>
            {isSubmitting ? "Guardando…" : `Registrar ${etiquetaServicio(tipo).toLowerCase()}`}
          </Button>
          <Button asChild type="button" variant="outline" className="h-11 w-full">
            <Link href="/dashboard/cafe/planta">Cancelar</Link>
          </Button>
        </div>
      </aside>

      {/* Tablet (< 1280 px): una sola columna, así que la merma en vivo y el botón de guardar quedan fijos al pie. */}
      <div className="sticky bottom-0 z-10 flex flex-row-reverse items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-lg xl:hidden">
        <p className="min-w-0 text-right text-sm text-gray-600">
          {merma ? (
            <>
              <span className="text-xl font-bold tabular-nums text-gray-900">{formatearPorcentaje(merma.mermaPct)} %</span>{" "}
              <span className="tabular-nums">{formatearPeso(merma.mermaKg)} kg</span>
              {merma.desvio && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Merma desviada</span>}
            </>
          ) : (
            "Merma: —"
          )}
        </p>
        <Button type="submit" className="h-12 shrink-0 px-6 text-base" disabled={isSubmitting || cargandoPeso}>
          {isSubmitting ? "Guardando…" : `Registrar ${etiquetaServicio(tipo).toLowerCase()}`}
        </Button>
      </div>
    </form>
  );
}
