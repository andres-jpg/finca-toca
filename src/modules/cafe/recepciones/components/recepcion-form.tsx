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
import { repartirPeso } from "../../lotes/lib/repartir-peso";
import { etiquetaServicio, etiquetaTueste } from "../../lotes/lib/servicios";
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
import { estimarServicios } from "../lib/estimar-servicios";
import type { ConfigRecepcion } from "../queries/recepcion.queries";
import {
  NIVELES_TUESTE,
  SERVICIOS_RECEPCION,
  recepcionSchema,
  type RecepcionFormInput,
  type RecepcionValues,
} from "../schemas/recepcion.schema";
import { EstimacionPanel } from "./estimacion-panel";

// Formulario pensado para la tablet de recepción: campos y botones de 44 px como mínimo y teclado decimal
// (`inputMode="decimal"`) en peso, humedad y densidad.
const CAMPO = "h-11 text-base";
const ENLACE_TARIFAS = "/dashboard/tarifas";

const AYUDA_SERVICIO: Record<(typeof SERVICIOS_RECEPCION)[number], string> = {
  trilla: "Pergamino → excelso",
  tostion: "Excelso → tostado",
  molienda: "Tostado → molido",
};

const redondear3 = (n: number) => Math.round(n * 1000) / 1000;
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
      nivelTueste: null,
      humedadPct: null,
      densidad: null,
      pesosBultos: null,
      observaciones: "",
    },
  });

  const [tercero, setTercero] = useState<TerceroOpcion | null>(null);
  const [agregandoRol, setAgregandoRol] = useState(false);
  // Pesos por bulto escritos a mano (texto, para no pelear con el cursor); `null` = partes iguales.
  const [textosBultos, setTextosBultos] = useState<string[] | null>(null);
  // Mientras el peso total no se escriba a mano, se sugiere `bultos × peso de un bulto` (62,5 kg por defecto).
  const [pesoManual, setPesoManual] = useState(false);

  const pesoKg = useWatch({ control, name: "pesoKg" });
  const numBultos = useWatch({ control, name: "numBultos" });
  const servicios = useWatch({ control, name: "servicios" });
  const humedadPct = useWatch({ control, name: "humedadPct" });
  const densidad = useWatch({ control, name: "densidad" });
  const nivelTueste = useWatch({ control, name: "nivelTueste" });
  const hayTostion = servicios.includes("tostion");

  const estimacion = useMemo(
    () => estimarServicios({ pesoKg, servicios, tarifas: config.tarifas, mermasRef: config.mermasRef }),
    [pesoKg, servicios, config.tarifas, config.mermasRef],
  );

  const repartido = useMemo(() => {
    try {
      return repartirPeso(pesoKg, numBultos).map(String);
    } catch {
      return [];
    }
  }, [pesoKg, numBultos]);
  const filasBultos = textosBultos ?? repartido;
  const sumaBultos = redondear3(filasBultos.reduce((a, t) => a + (Number(t) || 0), 0));

  const sinRolServicio = tercero !== null && !tercero.roles.includes("cliente_servicio");

  function restablecerBultos() {
    setTextosBultos(null);
    setValue("pesosBultos", null);
  }

  function editarBulto(i: number, texto: string) {
    const siguiente = [...filasBultos];
    siguiente[i] = texto;
    setTextosBultos(siguiente);
    const numeros = siguiente.map((t) => (t.trim() === "" ? Number.NaN : Number(t)));
    setValue("pesosBultos", numeros);
    // Con pesos individuales el total es su suma.
    if (numeros.every(Number.isFinite)) {
      setPesoManual(true);
      setValue("pesoKg", redondear3(numeros.reduce((a, b) => a + b, 0)), { shouldValidate: true });
    }
  }

  function alternarServicio(actuales: RecepcionFormInput["servicios"], servicio: (typeof SERVICIOS_RECEPCION)[number]) {
    let siguiente = actuales.includes(servicio) ? actuales.filter((s) => s !== servicio) : [...actuales, servicio];
    // La molienda y el empaque cuelgan de la tostión: sin ella no hay nivel de tueste ni molienda.
    if (!siguiente.includes("tostion")) {
      siguiente = siguiente.filter((s) => s !== "molienda");
      setValue("nivelTueste", null);
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

  const errorPesos = errors.pesosBultos as { message?: string } | undefined;

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

        {/* Bultos y peso */}
        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rec-bultos">Número de bultos</Label>
              <Input
                id="rec-bultos"
                type="number"
                inputMode="numeric"
                min={1}
                max={200}
                step={1}
                placeholder="Ej: 8"
                className={CAMPO}
                {...register("numBultos", {
                  valueAsNumber: true,
                  onChange: (e) => {
                    restablecerBultos();
                    const n = Number(e.target.value);
                    if (!pesoManual && Number.isInteger(n) && n > 0) {
                      setValue("pesoKg", redondear3(n * config.pesoBultoKg), { shouldValidate: true });
                    }
                  },
                })}
              />
              {errors.numBultos && <p className="text-xs text-red-500">{errors.numBultos.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-peso">Peso total (kg)</Label>
              <Input
                id="rec-peso"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                placeholder="Ej: 500"
                className={CAMPO}
                {...register("pesoKg", {
                  valueAsNumber: true,
                  onChange: (e) => {
                    setPesoManual(e.target.value !== "");
                    restablecerBultos();
                  },
                })}
              />
              {errors.pesoKg && <p className="text-xs text-red-500">{errors.pesoKg.message}</p>}
              <p className="text-xs text-gray-500">
                Se sugiere {config.pesoBultoKg.toLocaleString("es-CO")} kg por bulto; puedes cambiarlo.
              </p>
            </div>
          </div>

          <details className="group rounded-md border border-gray-200">
            <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 text-sm font-medium text-gray-700">
              <span>Pesos por bulto{textosBultos ? " (editados)" : " (partes iguales)"}</span>
              <span className="text-xs font-normal text-gray-500 group-open:hidden">Mostrar</span>
            </summary>
            <div className="space-y-3 border-t border-gray-200 p-3">
              {filasBultos.length === 0 ? (
                <p className="text-sm text-gray-500">Indica el número de bultos y el peso total.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {filasBultos.map((texto, i) => (
                      <div key={i} className="space-y-1">
                        <Label htmlFor={`rec-bulto-${i}`} className="text-xs text-gray-500">
                          Bulto {i + 1}
                        </Label>
                        <Input
                          id={`rec-bulto-${i}`}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="any"
                          value={texto}
                          onChange={(e) => editarBulto(i, e.target.value)}
                          className={CAMPO}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <p className="text-gray-600">
                      Suma: <span className="font-semibold tabular-nums">{sumaBultos.toLocaleString("es-CO", { maximumFractionDigits: 3 })} kg</span>
                    </p>
                    {textosBultos && (
                      <Button type="button" variant="outline" className="h-11" onClick={restablecerBultos}>
                        Repartir en partes iguales
                      </Button>
                    )}
                  </div>
                  {errorPesos?.message && <p className="text-xs text-red-500">{errorPesos.message}</p>}
                </>
              )}
            </div>
          </details>
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

        {/* Servicios */}
        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Servicios contratados</h2>
            <p className="text-xs text-gray-500">Si contrata trilla y maquila, se asigna un solo lote con ambos servicios.</p>
          </div>

          <Controller
            control={control}
            name="servicios"
            render={({ field }) => (
              <div className="space-y-2" role="group" aria-label="Servicios contratados">
                {SERVICIOS_RECEPCION.map((s) => {
                  const marcado = field.value.includes(s);
                  const deshabilitado = s === "molienda" && !hayTostion;
                  return (
                    <label
                      key={s}
                      className={cn(
                        "flex min-h-14 cursor-pointer items-center gap-3 rounded-md border px-3 py-2",
                        marcado ? "border-gray-800 bg-gray-50" : "border-gray-200",
                        deshabilitado && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="h-6 w-6 shrink-0 accent-gray-800"
                        checked={marcado}
                        disabled={deshabilitado}
                        onChange={() => field.onChange(alternarServicio(field.value, s))}
                      />
                      <span className="min-w-0">
                        <span className="block text-base font-medium text-gray-800">{etiquetaServicio(s)}</span>
                        <span className="block text-xs text-gray-500">
                          {deshabilitado ? "Requiere tostión" : AYUDA_SERVICIO[s]}
                        </span>
                      </span>
                    </label>
                  );
                })}

                {/* El empaque no se elige: va incluido con la tostión y la bolsa la trae el cliente. */}
                <label className="flex min-h-14 cursor-not-allowed items-center gap-3 rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-2 opacity-80">
                  <input type="checkbox" className="h-6 w-6 shrink-0" checked={hayTostion} disabled readOnly />
                  <span className="min-w-0">
                    <span className="block text-base font-medium text-gray-800">{etiquetaServicio("empaque")}</span>
                    <span className="block text-xs text-gray-500">
                      {hayTostion ? "Incluido sin coste — la bolsa la trae el cliente" : "Se incluye al contratar tostión"}
                    </span>
                  </span>
                </label>
              </div>
            )}
          />
          {errors.servicios && <p className="text-xs text-red-500">{errors.servicios.message}</p>}

          {hayTostion && (
            <div className="space-y-1.5">
              <Label id="rec-tueste-label">Nivel de tueste</Label>
              <Controller
                control={control}
                name="nivelTueste"
                render={({ field }) => (
                  <div role="radiogroup" aria-labelledby="rec-tueste-label" className="grid grid-cols-3 gap-2">
                    {NIVELES_TUESTE.map((n) => (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={field.value === n}
                        onClick={() => field.onChange(n)}
                        className={cn(
                          "min-h-12 rounded-md border px-3 text-base font-medium transition-colors",
                          field.value === n
                            ? "border-gray-900 bg-gray-900 text-white"
                            : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
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
                <p className="text-xs text-gray-500">Obligatorio con tostión: la planta lo ve al tostar.</p>
              )}
            </div>
          )}
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
          {isSubmitting ? "Guardando…" : "Registrar recepción"}
        </Button>
        <Button asChild type="button" variant="outline" className="h-11 w-full">
          <Link href="/dashboard/cafe/lotes">Cancelar</Link>
        </Button>
      </aside>
    </form>
  );
}
