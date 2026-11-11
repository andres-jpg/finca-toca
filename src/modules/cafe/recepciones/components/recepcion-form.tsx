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
import { TerceroCombobox } from "@/modules/core/terceros/components/tercero-combobox";
import type { RolTercero } from "@/modules/core/terceros/lib/roles";
import type { TerceroOpcion } from "@/modules/core/terceros/types";
import { etiquetaServicio } from "../../lotes/lib/servicios";
import {
  ETIQUETA_MODO_MOLIENDA,
  estimarMolienda,
  mensajeMoliendaExcede,
  textoEstimadoRecepcion,
  type ModoMolienda,
} from "../../procesos/lib/molienda";
import { parsearDecimal } from "../../procesos/lib/numero";
import { agregarRolClienteServicio, registrarRecepcion } from "../actions/recepciones.actions";
import {
  ETIQUETA_ALERTA_CALIDAD,
  formatearRango,
  mensajeFueraDeRango,
  mensajeRangoSinConfigurar,
  posicionEnRango,
  type MagnitudCalidad,
  type RangoCalidad,
} from "../lib/calidad";
import { estimarServicios, mermaTostionPonderada } from "../lib/estimar-servicios";
import { kgATostar } from "../lib/perfiles";
import type { ConfigRecepcion } from "../queries/recepcion.queries";
import {
  SERVICIOS_RECEPCION,
  recepcionSchema,
  type RecepcionFormInput,
  type RecepcionValues,
} from "../schemas/recepcion.schema";
import { EstimacionPanel } from "./estimacion-panel";
import { PerfilTuestePanel } from "./perfil-tueste-panel";

// Formulario pensado para la tablet de recepción: campos y botones de 44 px como mínimo y teclado decimal
// (`inputMode="decimal"`) en peso, humedad y densidad.
const CAMPO = "h-11 text-base";
const ENLACE_TARIFAS = "/dashboard/tarifas";

const AYUDA_SERVICIO: Record<(typeof SERVICIOS_RECEPCION)[number], string> = {
  trilla: "Pergamino → excelso",
  tostion: "Excelso → tostado",
  molienda: "Tostado → molido",
};

const numeroOpcional = (v: unknown) => (v === "" || v === null || v === undefined ? null : Number(v));

interface RecepcionFormProps {
  config: ConfigRecepcion;
  /** `YYYY-MM-DD` de hoy en la zona del cliente (lo calcula el servidor: el navegador puede estar en otra). */
  fechaHoy: string;
  /** owner/admin: ven los enlaces a Tarifas y parámetros y pueden marcar a un tercero como cliente de servicios. */
  puedeAdministrar: boolean;
}

/** Aviso en línea de humedad o densidad: ámbar si está fuera del rango, gris si está bien o no hay rango. */
function AvisoCalidad({
  magnitud,
  valor,
  rango,
  puedeConfigurar,
}: {
  magnitud: MagnitudCalidad;
  valor: number | null | undefined;
  rango: RangoCalidad | null;
  puedeConfigurar: boolean;
}) {
  if (!rango) {
    return (
      <p className="text-xs text-gray-500">
        {mensajeRangoSinConfigurar(magnitud)}
        {puedeConfigurar && (
          <>
            {" · "}
            <Link href={ENLACE_TARIFAS} className="font-medium underline underline-offset-2">
              Configurar en Tarifas y parámetros
            </Link>
          </>
        )}
      </p>
    );
  }
  if (posicionEnRango(valor, rango) && typeof valor === "number") {
    return (
      <p role="status" className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
        {mensajeFueraDeRango(magnitud, valor, rango)}
      </p>
    );
  }
  return <p className="text-xs text-gray-500">Rango aceptable: {formatearRango(rango, magnitud)}</p>;
}

/** Recepción de café de un cliente para trilla y/o maquila (HU-F1-02 y HU-F1-03). */
export function RecepcionForm({ config, fechaHoy, puedeAdministrar }: RecepcionFormProps) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RecepcionFormInput, unknown, RecepcionValues>({
    resolver: zodResolver(recepcionSchema),
    defaultValues: {
      terceroId: "",
      fecha: fechaHoy,
      servicios: [],
      // Terceros abre con el perfil de maquila vigente (B-18): nadie digita nada para el caso común.
      modoPerfil: "uno",
      nivelTueste: config.perfilMaquila?.nivel ?? null,
      perfilTempC: config.perfilMaquila?.tempC ?? null,
      perfilTiempoMin: config.perfilMaquila?.tiempoMin ?? null,
      perfiles: [],
      moliendaModo: null,
      moliendaKg: null,
      humedadPct: null,
      densidad: null,
      observaciones: "",
    },
  });

  const [tercero, setTercero] = useState<TerceroOpcion | null>(null);
  const [agregandoRol, setAgregandoRol] = useState(false);
  const pesoKg = useWatch({ control, name: "pesoKg" });
  const servicios = useWatch({ control, name: "servicios" });
  const humedadPct = useWatch({ control, name: "humedadPct" });
  const densidad = useWatch({ control, name: "densidad" });
  const nivelTueste = useWatch({ control, name: "nivelTueste" });
  const kgTostar = kgATostar(Number(pesoKg), servicios, config.mermasRef.trilla ?? 19);
  const hayTostion = servicios.includes("tostion");
  const hayMolienda = servicios.includes("molienda");
  const moliendaModoElegido = useWatch({ control, name: "moliendaModo" });
  const moliendaKgTxt = useWatch({ control, name: "moliendaKg" });
  const moliendaModo: ModoMolienda = moliendaModoElegido ?? "todo";
  const moliendaKg = typeof moliendaKgTxt === "number" ? moliendaKgTxt : parsearDecimal(moliendaKgTxt as unknown as string);

  const modoPerfil = useWatch({ control, name: "modoPerfil" });
  const perfilesForm = useWatch({ control, name: "perfiles" });
  const perfilesEstimacion = useMemo(
    () =>
      modoPerfil === "varios"
        ? (perfilesForm ?? []).map((p) => ({ nivel: p.nivel, kg: typeof p.kg === "number" ? p.kg : null }))
        : undefined,
    [modoPerfil, perfilesForm],
  );

  // Estimado de la molienda (B-03): con la merma de referencia de trilla y de tostión del nivel elegido.
  const moliendaEst = useMemo(() => {
    if (!hayMolienda || !Number.isFinite(pesoKg) || !(pesoKg > 0)) return null;
    return estimarMolienda({
      kgEntrada: pesoKg,
      trilla: servicios.includes("trilla"),
      mermaTrillaPct: config.mermasRef.trilla ?? 0,
      // Con varios perfiles (B-02) la merma de la tostión es la ponderada por kg.
      mermaTostionPct: mermaTostionPonderada(config.mermasRef, perfilesEstimacion) ?? config.mermasRef.tostion?.[nivelTueste ?? "medio"] ?? 0,
      modo: moliendaModo,
      kg: moliendaKg,
    });
  }, [hayMolienda, pesoKg, servicios, config.mermasRef, nivelTueste, perfilesEstimacion, moliendaModo, moliendaKg]);

  const estimacion = useMemo(
    () =>
      estimarServicios({
        pesoKg,
        servicios,
        tarifas: config.tarifas,
        mermasRef: config.mermasRef,
        nivelTueste,
        perfiles: perfilesEstimacion,
        molienda: hayMolienda ? { modo: moliendaModo, kg: moliendaKg } : null,
      }),
    [pesoKg, servicios, config.tarifas, config.mermasRef, nivelTueste, perfilesEstimacion, hayMolienda, moliendaModo, moliendaKg],
  );

  const sinRolServicio = tercero !== null && !tercero.roles.includes("cliente_servicio");

  function alternarServicio(actuales: RecepcionFormInput["servicios"], servicio: (typeof SERVICIOS_RECEPCION)[number]) {
    let siguiente = actuales.includes(servicio) ? actuales.filter((s) => s !== servicio) : [...actuales, servicio];
    // La molienda y el empaque cuelgan de la tostión: sin ella no hay nivel de tueste ni molienda.
    if (!siguiente.includes("tostion")) {
      siguiente = siguiente.filter((s) => s !== "molienda");
    } else if (!actuales.includes("tostion") && config.perfilMaquila) {
      // Recién elegida la tostión: vuelve a precargar el perfil de maquila si se había vaciado.
      setValue("nivelTueste", config.perfilMaquila.nivel);
      setValue("perfilTempC", config.perfilMaquila.tempC);
      setValue("perfilTiempoMin", config.perfilMaquila.tiempoMin);
    }
    if (!siguiente.includes("molienda")) {
      setValue("moliendaModo", null);
      setValue("moliendaKg", null);
    }
    return SERVICIOS_RECEPCION.filter((s) => siguiente.includes(s));
  }

  async function agregarRol() {
    if (!tercero) return;
    setAgregandoRol(true);
    const r = await agregarRolClienteServicio(tercero.id);
    setAgregandoRol(false);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    setTercero({ ...tercero, roles: r.data.roles as RolTercero[] });
    toast.success("Ahora es cliente de servicios");
  }

  const onSubmit = async (values: RecepcionValues) => {
    if (moliendaEst?.excede) {
      toast.error(mensajeMoliendaExcede(moliendaEst));
      return;
    }
    const r = await registrarRecepcion(values);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success(`Recepción registrada: ${r.data.codigo}`, {
      action: { label: "Ver lote", onClick: () => router.push(`/dashboard/cafe/lotes/${r.data.id}`) },
    });
    if (r.data.alertas_calidad.length > 0) {
      toast.warning(
        `Alertas de calidad: ${r.data.alertas_calidad.map((a) => ETIQUETA_ALERTA_CALIDAD[a]).join(", ")}. El lote se guardó igualmente.`,
      );
    }
    router.push("/dashboard/cafe/lotes");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        {/* Cliente y fecha */}
        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <Controller
              control={control}
              name="terceroId"
              render={({ field }) => (
                <div className="[&_button[role=combobox]]:h-11 [&_button[role=combobox]]:text-base">
                  <TerceroCombobox
                    value={field.value || null}
                    onChange={(id, t) => {
                      field.onChange(id);
                      setTercero(t);
                    }}
                    rol="cliente_servicio"
                    permitirCrear
                    placeholder="Selecciona o crea el cliente"
                  />
                </div>
              )}
            />
            {errors.terceroId && <p className="text-xs text-red-500">{errors.terceroId.message}</p>}
            {sinRolServicio && (
              <div role="alert" className="space-y-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <p>
                  <span className="font-medium">{tercero.nombre}</span> existe, pero no está registrado como cliente de
                  servicios.
                </p>
                {puedeAdministrar ? (
                  <Button type="button" variant="outline" className="h-11" onClick={agregarRol} disabled={agregandoRol}>
                    {agregandoRol ? "Añadiendo…" : "Añadir rol «Cliente de servicios»"}
                  </Button>
                ) : (
                  <p>Pide a un administrador que le añada ese rol, o crea un cliente nuevo.</p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5 sm:max-w-xs">
            <Label htmlFor="rec-fecha">Fecha de recepción</Label>
            <Input id="rec-fecha" type="date" max={fechaHoy} className={CAMPO} {...register("fecha")} />
            {errors.fecha && <p className="text-xs text-red-500">{errors.fecha.message}</p>}
          </div>
        </section>

        {/* Servicios contratados y tueste */}
        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Servicios contratados y tueste</h2>
            <p className="text-xs text-gray-500">Si contrata trilla y maquila, se asigna un solo lote con ambos servicios.</p>
          </div>

          <Controller
            control={control}
            name="servicios"
            render={({ field }) => (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Servicios contratados">
                {SERVICIOS_RECEPCION.map((s) => {
                  const marcado = field.value.includes(s);
                  const deshabilitado = s === "molienda" && !hayTostion;
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={marcado}
                      disabled={deshabilitado}
                      title={deshabilitado ? "Requiere tostión" : AYUDA_SERVICIO[s]}
                      onClick={() => field.onChange(alternarServicio(field.value, s))}
                      className={cn(
                        "min-h-12 rounded-full border px-5 text-base font-medium transition-colors",
                        marcado ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
                        deshabilitado && "cursor-not-allowed opacity-50 hover:bg-white",
                      )}
                    >
                      {etiquetaServicio(s)}
                    </button>
                  );
                })}
                {/* El empaque no se elige: va incluido con la tostión y la bolsa la trae el cliente. */}
                <button
                  type="button"
                  disabled
                  aria-pressed={hayTostion}
                  title="Se incluye al contratar tostión; la bolsa la trae el cliente"
                  className={cn(
                    "min-h-12 rounded-full border border-dashed px-5 text-base font-medium opacity-60",
                    hayTostion ? "border-gray-900 bg-gray-100 text-gray-900" : "border-gray-300 text-gray-500",
                  )}
                >
                  {etiquetaServicio("empaque")}
                </button>
              </div>
            )}
          />
          <p className="text-xs text-gray-500">
            {hayTostion
              ? "Empaque incluido sin coste: la bolsa la trae el cliente."
              : "La molienda y el empaque se incluyen al contratar tostión."}
          </p>
          {errors.servicios && <p className="text-xs text-red-500">{errors.servicios.message}</p>}

          {hayTostion && (
            <PerfilTuestePanel
              control={control}
              register={register}
              setValue={setValue}
              errors={errors}
              kgTostar={kgTostar}
              predeterminado={{ nivel: config.perfilMaquila?.nivel ?? null, tempC: config.perfilMaquila?.tempC ?? null, tiempoMin: config.perfilMaquila?.tiempoMin ?? null }}
            />
          )}
        </section>

        {/* Cantidad a moler (B-03): solo si se contrata molienda */}
        {hayMolienda && (
          <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm" aria-labelledby="rec-moler-titulo">
            <div>
              <h2 id="rec-moler-titulo" className="text-base font-semibold text-gray-800">
                Cantidad a moler
              </h2>
              <p className="text-xs text-gray-500">Se puede modificar al cerrar la tostión.</p>
            </div>
            <Controller
              control={control}
              name="moliendaModo"
              render={({ field }) => (
                <div role="radiogroup" aria-label="Cantidad a moler" className="grid grid-cols-3 gap-2">
                  {(["todo", "mitad", "kg"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={moliendaModo === m}
                      onClick={() => field.onChange(m)}
                      className={cn(
                        "min-h-12 rounded-md border px-3 text-base font-medium transition-colors",
                        moliendaModo === m ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
                      )}
                    >
                      {ETIQUETA_MODO_MOLIENDA[m]}
                    </button>
                  ))}
                </div>
              )}
            />
            {moliendaModo === "kg" && (
              <div className="space-y-1.5 sm:max-w-xs">
                <Label htmlFor="rec-moler-kg">Kilos a moler (kg)</Label>
                <Input
                  id="rec-moler-kg"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  placeholder="Ej: 10,0"
                  className={CAMPO}
                  {...register("moliendaKg", { setValueAs: numeroOpcional })}
                />
                {errors.moliendaKg && <p className="text-xs text-red-500">{errors.moliendaKg.message}</p>}
              </div>
            )}
            {moliendaEst ? (
              <>
                <p className="text-sm text-gray-700" aria-live="polite">
                  {textoEstimadoRecepcion(moliendaEst)}
                </p>
                {moliendaEst.excede && (
                  <p role="alert" className="text-xs font-medium text-red-600">
                    {mensajeMoliendaExcede(moliendaEst)}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-gray-500">Indicar el peso recibido para ver el estimado.</p>
            )}
          </section>
        )}

        {/* Peso */}
        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="space-y-1.5 sm:max-w-xs">
            <Label htmlFor="rec-peso">Peso recibido (kg)</Label>
            <Input
              id="rec-peso"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              placeholder="Ej: 500,0"
              className={CAMPO}
              {...register("pesoKg", { valueAsNumber: true })}
            />
            {errors.pesoKg && <p className="text-xs text-red-500">{errors.pesoKg.message}</p>}
          </div>
        </section>

        {/* Calidad */}
        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Calidad del café</h2>
            <p className="text-xs text-gray-500">Opcional. Si algo queda fuera de rango se avisa, pero no se bloquea el registro.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rec-humedad">Humedad (%)</Label>
              <Input
                id="rec-humedad"
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step="any"
                placeholder="Ej: 11,5"
                className={CAMPO}
                {...register("humedadPct", { setValueAs: numeroOpcional })}
              />
              {errors.humedadPct && <p className="text-xs text-red-500">{errors.humedadPct.message}</p>}
              <AvisoCalidad magnitud="humedad" valor={humedadPct} rango={config.rangoHumedad} puedeConfigurar={puedeAdministrar} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-densidad">Densidad</Label>
              <Input
                id="rec-densidad"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                placeholder="Ej: 680"
                className={CAMPO}
                {...register("densidad", { setValueAs: numeroOpcional })}
              />
              {errors.densidad && <p className="text-xs text-red-500">{errors.densidad.message}</p>}
              <AvisoCalidad magnitud="densidad" valor={densidad} rango={config.rangoDensidad} puedeConfigurar={puedeAdministrar} />
            </div>
          </div>
        </section>

        <section className="space-y-1.5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <Label htmlFor="rec-obs">Observaciones (opcional)</Label>
          <Textarea id="rec-obs" rows={3} className="text-base" placeholder="Ej: viene en costales de fique" {...register("observaciones")} />
          {errors.observaciones && <p className="text-xs text-red-500">{errors.observaciones.message}</p>}
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <EstimacionPanel estimacion={estimacion} puedeConfigurar={puedeAdministrar} />
        <Button type="submit" className="h-12 w-full text-base" disabled={isSubmitting || sinRolServicio}>
          {isSubmitting ? "Guardando…" : "Guardar y enviar a planta"}
        </Button>
        <Button asChild type="button" variant="outline" className="h-11 w-full">
          <Link href="/dashboard/cafe/lotes">Cancelar</Link>
        </Button>
      </aside>
    </form>
  );
}
