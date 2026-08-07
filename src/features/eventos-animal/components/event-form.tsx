"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { eventoSchema } from "@/features/eventos-animal/schemas/evento.schema";
import {
  createEventoAnimal,
  updateEventoAnimal,
} from "@/features/eventos-animal/actions/eventos.actions";
import { createAnimal } from "@/features/animales/actions/animales.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/shared/date-picker";
import { proyeccionesServicio } from "@/lib/animales/estados";
import { RAZAS, RAZA_LABELS, construirSangre } from "@/lib/animales/razas";
import { toast } from "sonner";
import type {
  Animal,
  AnimalRaza,
  AnimalSexo,
  EventoAnimal,
  PajillaDisponible,
  ResultadoPalpacion,
  TipoEvento,
} from "@/types";

const TIPO_LABELS: Record<TipoEvento, string> = {
  celo: "Celo",
  inseminacion: "Inseminación",
  monta: "Monta",
  palpacion: "Palpación",
  confirmacion_prenez: "Confirmación de preñez",
  parto: "Parto",
  aborto: "Aborto",
  secado: "Secado",
  topizado: "Topizado",
  vacunacion: "Vacunación",
  vitaminacion: "Vitaminación",
  medicamento: "Medicamento",
  enfermedad: "Enfermedad",
  observacion: "Observación",
};

const RESULTADO_LABELS: Record<ResultadoPalpacion, string> = {
  cargada: "Cargada — preñez confirmada",
  rechequeo: "Rechequeo — repetir revisión",
  vacia: "Vacía — no quedó preñada",
};

/** Nota que se muestra bajo el selector para explicar el efecto en el estado del animal. */
const TIPO_EFECTO: Partial<Record<TipoEvento, string>> = {
  inseminacion: "La vaca pasará a «Por confirmar».",
  monta: "La vaca pasará a «Por confirmar».",
  parto: "La vaca pasará a «Producción» y «Pre-servicio».",
  aborto: "La vaca pasará a «Producción» y «Pre-servicio»; se cancelan las alertas de parto y secado.",
  secado: "La vaca pasará a «Secado» y dejará de contarse en producción.",
};

interface EventFormProps {
  animalId: string;
  animalTipo: "vaca" | "toro";
  evento?: EventoAnimal;
  /** Machos de alta, para el selector de toro en una monta y como padre de la cría. */
  toros?: Animal[];
  /** Lotes de pajillas con su stock, para el selector de inseminación y de padre de la cría. */
  lotesPajillas?: PajillaDisponible[];
  /** El animal sobre el que se registra el evento (la madre) — prellena raza y último servicio al registrar un parto. */
  madre?: Animal;
  /** Eventos ya cargados de este animal, para heredar el padre del último servicio en un parto. */
  eventosPrevios?: EventoAnimal[];
  /** "Nombre largo" y "Sangre" (% de pureza) del subformulario de cría, solo para El Velero. */
  esVelero?: boolean;
  onSuccess: () => void;
}

interface FormValues {
  animal_id: string;
  animal_tipo: "vaca" | "toro";
  tipo_evento: TipoEvento;
  fecha: Date;
  descripcion?: string;
  responsable?: string;
  resultado?: ResultadoPalpacion | null;
  pajilla_id?: string | null;
  toro_id?: string | null;
}

export function EventForm({
  animalId,
  animalTipo,
  evento,
  toros = [],
  lotesPajillas = [],
  madre,
  eventosPrevios = [],
  esVelero = false,
  onSuccess,
}: EventFormProps) {
  const isEditing = !!evento;

  // Último servicio (inseminación o monta) registrado en este animal, para heredar el padre
  // de la cría al registrar un parto — mismo criterio que usan las alertas de parto/secado:
  // la fecha/padre reales están en el evento de servicio, no en el estado del animal.
  const ultimoServicio = useMemo(() => {
    const ultimo = eventosPrevios.find(
      (e) => e.tipo_evento === "inseminacion" || e.tipo_evento === "monta"
    );
    if (!ultimo) return null;
    if (ultimo.tipo_evento === "monta" && ultimo.toro_id) {
      const toro = toros.find((t) => t.id === ultimo.toro_id);
      if (toro) return { tipo: "animal" as const, id: toro.id, nombre: toro.nombre };
    }
    if (ultimo.tipo_evento === "inseminacion" && ultimo.pajilla_id) {
      const lote = lotesPajillas.find((p) => p.id === ultimo.pajilla_id);
      if (lote) return { tipo: "pajilla" as const, id: lote.id, nombre: lote.toro_nombre };
    }
    return null;
  }, [eventosPrevios, toros, lotesPajillas]);

  // Datos de la cría a crear junto con el evento de parto — solo aplica al registrar uno
  // nuevo (no al editar uno ya existente, cuya cría ya se creó la primera vez).
  const [criaSexo, setCriaSexo] = useState<AnimalSexo | "">("");
  const [criaIdentificador, setCriaIdentificador] = useState("");
  const [criaNumeroRegistro, setCriaNumeroRegistro] = useState("");
  const [criaNombreLargo, setCriaNombreLargo] = useState("");
  const [criaNombre, setCriaNombre] = useState("");
  const [criaRaza, setCriaRaza] = useState<AnimalRaza | "">(madre?.raza ?? "");
  // Sangre: mismo selector guiado que el alta normal (hasta dos razas + %), solo El Velero.
  const [criaSangreRaza1, setCriaSangreRaza1] = useState<AnimalRaza | "">("");
  const [criaSangrePct1, setCriaSangrePct1] = useState<number | "">("");
  const [criaSangreRaza2, setCriaSangreRaza2] = useState<AnimalRaza | "">("");
  const criaSangrePct2 = criaSangreRaza2 ? Math.max(0, 100 - (Number(criaSangrePct1) || 0)) : null;
  const criaSangre = construirSangre(
    criaSangreRaza1 || null,
    Number(criaSangrePct1) || null,
    criaSangreRaza2 || null,
    criaSangrePct2
  );
  // El padre de la cría no se elige a mano: se infiere del último servicio (monta o
  // inseminación) registrado en la vaca. La única alternativa manual es un toro de alquiler,
  // para el caso de una monta natural que no quedó registrada como evento.
  const [criaEsAlquiler, setCriaEsAlquiler] = useState(false);
  const [criaAlquilerNombre, setCriaAlquilerNombre] = useState("");
  const [criaAlquilerRaza, setCriaAlquilerRaza] = useState<AnimalRaza | "">("");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(eventoSchema) as any,
    defaultValues: {
      animal_id: animalId,
      animal_tipo: animalTipo,
      tipo_evento: evento?.tipo_evento ?? undefined,
      fecha: evento?.fecha ? new Date(evento.fecha + "T00:00:00") : undefined,
      descripcion: evento?.descripcion ?? "",
      responsable: evento?.responsable ?? "",
      resultado: evento?.resultado ?? null,
      pajilla_id: evento?.pajilla_id ?? null,
      toro_id: evento?.toro_id ?? null,
    },
  });

  const tipoValue = watch("tipo_evento");
  const fechaValue = watch("fecha");
  const resultadoValue = watch("resultado");
  const pajillaValue = watch("pajilla_id");
  const toroValue = watch("toro_id");

  // Se ocultan los lotes agotados, salvo el que ya tenga este evento: al editar una
  // inseminación su lote puede estar a 0 precisamente porque gastó la última pajilla,
  // y filtrarlo dejaría el selector vacío borrando la referencia al guardar.
  const lotesSeleccionables = lotesPajillas.filter(
    (p) => p.cantidad_disponible > 0 || p.id === pajillaValue
  );

  const esServicio = tipoValue === "inseminacion" || tipoValue === "monta";
  const esConfirmacion =
    tipoValue === "palpacion" || tipoValue === "confirmacion_prenez";
  // La cría solo se crea junto con un parto nuevo — al editar uno ya existente la cría
  // ya se creó la primera vez, así que el subformulario no vuelve a aparecer.
  const mostrarCriaForm = tipoValue === "parto" && !isEditing;

  // Al registrar el servicio se muestran ya las fechas que generarán las alertas,
  // para que el usuario detecte de inmediato si se equivocó de día.
  const proyecciones = esServicio && fechaValue ? proyeccionesServicio(fechaValue) : null;

  const onSubmit = async (data: FormValues) => {
    const payload = {
      animal_id: data.animal_id,
      animal_tipo: data.animal_tipo,
      tipo_evento: data.tipo_evento,
      fecha: data.fecha,
      descripcion: data.descripcion,
      responsable: data.responsable,
      // Solo se persiste el campo que corresponde al tipo elegido.
      resultado: esConfirmacion ? data.resultado : null,
      pajilla_id: data.tipo_evento === "inseminacion" ? data.pajilla_id : null,
      toro_id: data.tipo_evento === "monta" ? data.toro_id : null,
    };

    try {
      if (isEditing) {
        await updateEventoAnimal(evento.id, payload);
        toast.success("Evento actualizado");
      } else if (mostrarCriaForm) {
        if (!criaSexo || !criaIdentificador.trim() || !criaNombre.trim() || !criaRaza) {
          toast.error("Completa el sexo, identificador, nombre y raza de la cría");
          return;
        }
        if (criaEsAlquiler && !criaAlquilerNombre.trim()) {
          toast.error("Escribe el nombre del toro de alquiler, padre de la cría");
          return;
        }

        // El padre se infiere del último servicio (monta o inseminación) registrado en la
        // vaca; la única alternativa manual es un toro de alquiler.
        const padreInferido = !criaEsAlquiler ? ultimoServicio : null;

        // Se garantiza que la cría quede creada antes de registrar el parto: si esto
        // falla, se aborta sin guardar el evento en vez de dejar un parto sin animal.
        try {
          await createAnimal({
            identificador: criaIdentificador.trim(),
            numero_registro: criaNumeroRegistro.trim(),
            nombre_largo: esVelero ? criaNombreLargo.trim() || null : null,
            nombre: criaNombre.trim(),
            sexo: criaSexo,
            raza: criaRaza,
            sangre: esVelero ? criaSangre : null,
            origen: "finca",
            estado_productivo: "leche",
            fecha_nacimiento: data.fecha,
            madre_id: animalId,
            padre_id: padreInferido?.tipo === "animal" ? padreInferido.id : null,
            padre_pajilla_id: padreInferido?.tipo === "pajilla" ? padreInferido.id : null,
            padre_alquiler_nombre: criaEsAlquiler ? criaAlquilerNombre.trim() : null,
            padre_alquiler_raza: criaEsAlquiler ? criaAlquilerRaza || null : null,
          });
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "No se pudo registrar la cría");
          return;
        }

        try {
          await createEventoAnimal(payload);
          toast.success("Parto y cría registrados");
        } catch (error) {
          toast.error(
            (error instanceof Error ? error.message : "No se pudo registrar el evento de parto") +
              " — la cría ya quedó creada; registra el parto manualmente desde el historial."
          );
          onSuccess();
          return;
        }
      } else {
        await createEventoAnimal(payload);
        toast.success("Evento registrado");
      }
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label>Tipo de evento</Label>
        <Select
          value={tipoValue ?? ""}
          onValueChange={(val) => setValue("tipo_evento", val as TipoEvento)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Seleccionar tipo" />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(TIPO_LABELS) as [TipoEvento, string][]).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {tipoValue && TIPO_EFECTO[tipoValue] && (
          <p className="text-xs text-blue-600">{TIPO_EFECTO[tipoValue]}</p>
        )}
        {errors.tipo_evento && (
          <p className="text-sm text-red-500">{errors.tipo_evento.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Fecha</Label>
        <DatePicker
          value={fechaValue}
          onChange={(date) => setValue("fecha", date)}
          placeholder="Seleccionar fecha del evento"
        />
        {proyecciones && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 space-y-0.5">
            <p className="font-medium">Fechas calculadas desde este servicio</p>
            <p>
              Pasar a secado:{" "}
              <span className="font-medium">
                {format(proyecciones.secado, "dd/MM/yyyy", { locale: es })}
              </span>{" "}
              · Parto probable:{" "}
              <span className="font-medium">
                {format(proyecciones.parto, "dd/MM/yyyy", { locale: es })}
              </span>
            </p>
            <p className="text-blue-600">
              Las alertas aparecerán cuando confirmes la preñez con una palpación.
            </p>
          </div>
        )}
        {errors.fecha && <p className="text-sm text-red-500">{errors.fecha.message}</p>}
      </div>

      {/* Parto: se crea la cría en el mismo paso, con madre y (si se pudo inferir) padre ya prellenados */}
      {mostrarCriaForm && (
        <div className="space-y-3 rounded-lg border border-gray-200 p-3">
          <div>
            <Label>Datos de la cría</Label>
            <p className="text-xs text-gray-400 mt-0.5">
              Madre: <span className="font-medium text-gray-600">{madre?.nombre ?? "esta vaca"}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select
              value={criaSexo || "none"}
              onValueChange={(val) => setCriaSexo(val === "none" ? "" : (val as AnimalSexo))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sexo de la cría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Seleccionar sexo</SelectItem>
                <SelectItem value="hembra">Hembra</SelectItem>
                <SelectItem value="macho">Macho</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={criaRaza || "none"}
              onValueChange={(val) => setCriaRaza(val === "none" ? "" : (val as AnimalRaza))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Raza" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Seleccionar raza</SelectItem>
                {RAZAS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {RAZA_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sangre: % de pureza, opcional. Solo El Velero — mismo selector que el alta normal. */}
          {esVelero && (
            <div className="space-y-2 rounded-lg border border-gray-200 p-3">
              <Label className="text-xs text-gray-500">Sangre (% de pureza) — opcional</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Select
                    value={criaSangreRaza1 || "none"}
                    onValueChange={(val) =>
                      setCriaSangreRaza1(val === "none" ? "" : (val as AnimalRaza))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Raza 1" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin definir</SelectItem>
                      {RAZAS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {RAZA_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    max={criaSangreRaza2 ? 99 : 100}
                    placeholder="% pureza"
                    disabled={!criaSangreRaza1}
                    value={criaSangrePct1}
                    onChange={(e) =>
                      setCriaSangrePct1(e.target.value === "" ? "" : Number(e.target.value))
                    }
                  />
                </div>

                <div className="space-y-1">
                  <Select
                    value={criaSangreRaza2 || "none"}
                    onValueChange={(val) =>
                      setCriaSangreRaza2(val === "none" ? "" : (val as AnimalRaza))
                    }
                    disabled={!criaSangreRaza1 || !criaSangrePct1}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Raza 2 (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Ninguna</SelectItem>
                      {RAZAS.filter((r) => r !== criaSangreRaza1).map((r) => (
                        <SelectItem key={r} value={r}>
                          {RAZA_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input type="number" placeholder="% pureza" disabled value={criaSangrePct2 ?? ""} />
                </div>
              </div>
              {criaSangre && (
                <p className="text-xs text-gray-500">
                  Se guardará como: <span className="font-medium text-gray-700">{criaSangre}</span>
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input
              type="text"
              placeholder="Identificador (ej: 231)"
              value={criaIdentificador}
              onChange={(e) => setCriaIdentificador(e.target.value)}
            />
            <Input
              type="text"
              placeholder="Número de registro (opcional)"
              value={criaNumeroRegistro}
              onChange={(e) => setCriaNumeroRegistro(e.target.value)}
            />
          </div>

          {/* Nombre largo: solo El Velero. */}
          {esVelero && (
            <Input
              type="text"
              placeholder="Nombre largo (opcional)"
              value={criaNombreLargo}
              onChange={(e) => setCriaNombreLargo(e.target.value)}
            />
          )}

          <Input
            type="text"
            placeholder="Nombre"
            value={criaNombre}
            onChange={(e) => setCriaNombre(e.target.value)}
          />

          <div className="space-y-2">
            <Label className="text-xs text-gray-500">Padre de la cría</Label>

            {!criaEsAlquiler && (
              ultimoServicio ? (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                  <p className="text-xs text-blue-600 font-medium">Inferido del último servicio</p>
                  <p className="text-sm text-blue-800 font-semibold">{ultimoServicio.nombre}</p>
                </div>
              ) : (
                <p className="text-xs text-gray-400">
                  No se encontró una inseminación o monta previa registrada en esta vaca. La
                  cría quedará sin padre, salvo que marques que fue un toro de alquiler.
                </p>
              )
            )}

            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={criaEsAlquiler}
                onChange={(e) => setCriaEsAlquiler(e.target.checked)}
              />
              Fue un toro de alquiler{ultimoServicio ? " (en vez del inferido arriba)" : ""}
            </label>

            {criaEsAlquiler && (
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="text"
                  placeholder="Nombre del toro de alquiler (ej: Aurora)"
                  value={criaAlquilerNombre}
                  onChange={(e) => setCriaAlquilerNombre(e.target.value)}
                />
                <Select
                  value={criaAlquilerRaza || "none"}
                  onValueChange={(val) =>
                    setCriaAlquilerRaza(val === "none" ? "" : (val as AnimalRaza))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Raza (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin definir</SelectItem>
                    {RAZAS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {RAZA_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Inseminación: qué pajilla se usó */}
      {tipoValue === "inseminacion" && (
        <div className="space-y-2">
          <Label>Pajilla utilizada</Label>
          <Select
            value={pajillaValue ?? ""}
            onValueChange={(val) => setValue("pajilla_id", val || null)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar lote de pajillas (opcional)" />
            </SelectTrigger>
            <SelectContent>
              {lotesSeleccionables.length === 0 ? (
                <div className="px-2 py-3 text-sm text-gray-400">
                  No hay pajillas disponibles en el inventario
                </div>
              ) : (
                lotesSeleccionables.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.toro_nombre} · {format(new Date(p.fecha_compra + "T00:00:00"), "dd/MM/yyyy")}{" "}
                    — {p.cantidad_disponible} disponible(s)
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-400">
            Se listan los lotes con existencias. Al guardar se descuenta una pajilla del lote
            elegido; si luego editas o eliminas el evento, el inventario se ajusta solo.
          </p>
        </div>
      )}

      {/* Monta: qué toro cubrió */}
      {tipoValue === "monta" && (
        <div className="space-y-2">
          <Label>Toro</Label>
          <Select
            value={toroValue ?? ""}
            onValueChange={(val) => setValue("toro_id", val || null)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar toro (opcional)" />
            </SelectTrigger>
            <SelectContent>
              {toros.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  #{t.identificador} — {t.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Palpación / confirmación: el resultado decide el estado reproductivo */}
      {esConfirmacion && (
        <div className="space-y-2">
          <Label>Resultado</Label>
          <Select
            value={resultadoValue ?? ""}
            onValueChange={(val) => setValue("resultado", val as ResultadoPalpacion)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar resultado" />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(RESULTADO_LABELS) as [ResultadoPalpacion, string][]).map(
                ([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
          {errors.resultado && (
            <p className="text-sm text-red-500">{errors.resultado.message}</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="descripcion">Descripción</Label>
        <Textarea
          id="descripcion"
          placeholder="Detalle del evento (opcional)"
          rows={3}
          {...register("descripcion")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="responsable">Responsable</Label>
        <Input
          id="responsable"
          type="text"
          placeholder="Nombre del responsable (opcional)"
          {...register("responsable")}
        />
      </div>

      <div className="flex gap-2 pt-4">
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : isEditing ? "Actualizar evento" : "Registrar evento"}
        </Button>
      </div>
    </form>
  );
}
