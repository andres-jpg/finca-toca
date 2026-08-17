"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { animalSchema } from "@/features/animales/schemas/animal.schema";
import { createAnimal, updateAnimal } from "@/features/animales/actions/animales.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/shared/date-picker";
import {
  ESTADOS_PRODUCTIVOS_POR_SEXO,
  ESTADOS_REPRODUCTIVOS,
  ESTADO_PRODUCTIVO_LABELS,
  ESTADO_REPRODUCTIVO_LABELS,
} from "@/lib/animales/estados";
import { RAZAS, RAZA_LABELS } from "@/lib/animales/razas";
import { SangreSelector } from "@/features/animales/components/sangre-selector";
import { toast } from "sonner";
import type {
  Animal,
  AnimalRaza,
  AnimalSexo,
  EstadoProductivo,
  EstadoReproductivo,
  PajillaDisponible,
} from "@/types";

const SEXO_LABELS: Record<AnimalSexo, string> = {
  hembra: "Hembra",
  macho: "Macho",
};

const ORIGEN_LABELS: Record<string, string> = {
  finca: "Finca",
  externa: "Externa",
};

type PadreTipo = "none" | "animal" | "pajilla" | "alquiler";

const PADRE_TIPO_LABELS: Record<PadreTipo, string> = {
  none: "Sin padre",
  animal: "Macho de finca",
  pajilla: "Pajilla",
  alquiler: "Toro de alquiler",
};

interface FormValues {
  identificador: string;
  nombre: string;
  /** Solo diligenciado en el formulario de El Velero. */
  nombre_largo?: string;
  sexo: AnimalSexo;
  raza: AnimalRaza;
  sangre?: string | null;
  origen: "finca" | "externa";
  estado_productivo?: string | null;
  estado_reproductivo?: string | null;
  fecha_compra?: Date | null;
  fecha_nacimiento?: Date | null;
  numero_registro?: string;
  madre_id?: string | null;
  /** Texto libre, solo cuando `origen === "externa"` y la madre no está registrada. */
  madre_externa_nombre?: string;
  padre_id?: string | null;
  padre_alquiler_nombre?: string;
  padre_alquiler_raza?: AnimalRaza | null;
  /** Solo hembras. `null` = sin definir (el input vacío se normaliza a `null`). */
  concentrado_por_ordeno?: number | null;
}

interface AnimalFormProps {
  animal?: Animal;
  animales: Animal[];
  lotesPajillas: PajillaDisponible[];
  /** "Nombre largo" y "Sangre" (% de pureza) solo se ofrecen en el formulario de El Velero. */
  esVelero: boolean;
  onSuccess: () => void;
}

export function AnimalForm({ animal, animales, lotesPajillas, esVelero, onSuccess }: AnimalFormProps) {
  const getInitialPadreTipo = (): PadreTipo => {
    if (!animal) return "none";
    if (animal.padre_id) return "animal";
    if (animal.padre_pajilla_nombre) return "pajilla";
    if (animal.padre_alquiler_nombre) return "alquiler";
    return "none";
  };

  const [padreTipo, setPadreTipo] = useState<PadreTipo>(getInitialPadreTipo);
  const [selectedPajillaToro, setSelectedPajillaToro] = useState<string>("");

  // Sin filtrar por stock: la cría nace ~9 meses después de usarse la pajilla, así que su
  // lote de origen casi siempre está ya agotado. Aquí solo se registra de qué toro vino.
  const lotesParaPadre = lotesPajillas;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(animalSchema) as any,
    defaultValues: {
      identificador: animal?.identificador ?? "",
      nombre: animal?.nombre ?? "",
      nombre_largo: animal?.nombre_largo ?? "",
      sexo: animal?.sexo ?? undefined,
      raza: animal?.raza ?? undefined,
      sangre: animal?.sangre ?? null,
      origen: animal?.origen ?? undefined,
      estado_productivo: animal?.estado_productivo ?? undefined,
      estado_reproductivo: animal?.estado_reproductivo ?? undefined,
      fecha_compra: animal?.fecha_compra ? new Date(animal.fecha_compra + "T00:00:00") : null,
      fecha_nacimiento: animal?.fecha_nacimiento
        ? new Date(animal.fecha_nacimiento + "T00:00:00")
        : null,
      numero_registro: animal?.numero_registro ?? "",
      madre_id: animal?.madre_id ?? null,
      madre_externa_nombre: animal?.madre_externa_nombre ?? "",
      padre_id: animal?.padre_id ?? null,
      padre_alquiler_nombre: animal?.padre_alquiler_nombre ?? "",
      padre_alquiler_raza: animal?.padre_alquiler_raza ?? null,
      concentrado_por_ordeno: animal?.concentrado_por_ordeno ?? null,
    },
  });

  const sexoValue = watch("sexo");
  const origenValue = watch("origen");
  const estadoProductivoValue = watch("estado_productivo");
  const estadoReproductivoValue = watch("estado_reproductivo");
  const fechaCompraValue = watch("fecha_compra");
  const fechaNacimientoValue = watch("fecha_nacimiento");
  const madreIdValue = watch("madre_id");
  const padreIdValue = watch("padre_id");

  const madresDisponibles = animales.filter((a) => a.sexo === "hembra" && a.id !== animal?.id);
  const padresDisponibles = animales.filter((a) => a.sexo === "macho" && a.id !== animal?.id);
  const estadosProductivosDisponibles = sexoValue ? ESTADOS_PRODUCTIVOS_POR_SEXO[sexoValue] : [];

  useEffect(() => {
    if (
      sexoValue &&
      estadoProductivoValue &&
      !ESTADOS_PRODUCTIVOS_POR_SEXO[sexoValue].includes(estadoProductivoValue as EstadoProductivo)
    ) {
      setValue("estado_productivo", null);
    }
    // El ciclo reproductivo solo existe en hembras.
    if (sexoValue === "macho") {
      setValue("estado_reproductivo", null);
      if (padreTipo === "pajilla") {
        setPadreTipo("none");
        setValue("padre_id", null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sexoValue]);

  const handlePadreTipoChange = (tipo: PadreTipo) => {
    setPadreTipo(tipo);
    setValue("padre_id", null);
    setValue("padre_alquiler_nombre", "");
    setValue("padre_alquiler_raza", null);
    setSelectedPajillaToro("");
  };

  const onSubmit = async (data: FormValues) => {
    try {
      const base = {
        identificador: data.identificador,
        nombre: data.nombre,
        nombre_largo: esVelero ? data.nombre_largo?.trim() || null : null,
        sexo: data.sexo,
        raza: data.raza,
        sangre: esVelero ? data.sangre || null : null,
        origen: data.origen,
        estado_productivo: (data.estado_productivo || null) as EstadoProductivo | null,
        estado_reproductivo:
          data.sexo === "hembra"
            ? ((data.estado_reproductivo || null) as EstadoReproductivo | null)
            : null,
        fecha_compra: data.origen === "externa" ? data.fecha_compra : null,
        fecha_nacimiento: data.fecha_nacimiento || null,
        numero_registro: data.numero_registro,
        madre_id: data.madre_id || null,
        madre_externa_nombre:
          data.origen === "externa" ? data.madre_externa_nombre?.trim() || null : null,
        padre_id: padreTipo === "animal" ? (data.padre_id || null) : null,
        padre_pajilla_id:
          padreTipo === "pajilla" && selectedPajillaToro ? selectedPajillaToro : null,
        padre_pajilla_nombre_keep:
          padreTipo === "pajilla" && !selectedPajillaToro
            ? (animal?.padre_pajilla_nombre ?? null)
            : null,
        // El nombre de padre libre aplica a dos casos: el toro de alquiler (origen finca) y
        // el padre de un animal de origen externo, que tampoco tiene registro propio.
        padre_alquiler_nombre:
          padreTipo === "alquiler" || data.origen === "externa"
            ? data.padre_alquiler_nombre?.trim() || null
            : null,
        padre_alquiler_raza:
          padreTipo === "alquiler" || data.origen === "externa"
            ? data.padre_alquiler_raza || null
            : null,
        // Solo hembras: a un macho no se le ordeña. El input vacío llega ya como null.
        concentrado_por_ordeno:
          data.sexo === "hembra" ? (data.concentrado_por_ordeno ?? null) : null,
      };

      if (animal) {
        await updateAnimal(animal.id, base);
        toast.success("Animal actualizado");
      } else {
        if (padreTipo === "pajilla" && !selectedPajillaToro) {
          toast.error("Selecciona una pajilla para el padre");
          return;
        }
        if (padreTipo === "alquiler" && !data.padre_alquiler_nombre?.trim()) {
          toast.error("Escribe el nombre del toro de alquiler");
          return;
        }
        await createAnimal(base);
        toast.success("Animal creado");
      }
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Sexo</Label>
          <Select
            value={sexoValue ?? ""}
            onValueChange={(val) => setValue("sexo", val as AnimalSexo)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar sexo" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SEXO_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.sexo && <p className="text-sm text-red-500">{errors.sexo.message}</p>}
        </div>

        <div className="space-y-2">
          <Label>Raza</Label>
          <Select
            value={watch("raza") ?? ""}
            onValueChange={(val) => setValue("raza", val as AnimalRaza)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar raza" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(RAZA_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.raza && <p className="text-sm text-red-500">{errors.raza.message}</p>}
        </div>
      </div>

      {/* Sangre: % de pureza, opcional. Hasta tres razas (la tercera solo si las dos
          primeras no llegan al 100%). Solo El Velero. */}
      {esVelero && (
        <SangreSelector
          value={animal?.sangre}
          onChange={(sangre) => setValue("sangre", sangre)}
        />
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="identificador">Identificador</Label>
          <Input
            id="identificador"
            type="text"
            placeholder="Ej: 123, A-01, VL-007"
            {...register("identificador")}
          />
          {errors.identificador && (
            <p className="text-sm text-red-500">{errors.identificador.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="numero_registro">Número de registro</Label>
          <Input
            id="numero_registro"
            type="text"
            placeholder="Ej: REG-0123 (opcional)"
            {...register("numero_registro")}
          />
        </div>
      </div>

      {/* Nombre largo: solo El Velero. */}
      {esVelero && (
        <div className="space-y-2">
          <Label htmlFor="nombre_largo">Nombre largo</Label>
          <Input
            id="nombre_largo"
            type="text"
            placeholder="Nombre largo (opcional)"
            {...register("nombre_largo")}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre</Label>
        <Input id="nombre" type="text" placeholder="Ej: Vanessa" {...register("nombre")} />
        {errors.nombre && <p className="text-sm text-red-500">{errors.nombre.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Origen</Label>
          <Select
            value={origenValue ?? ""}
            onValueChange={(val) => setValue("origen", val as "finca" | "externa")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar origen" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ORIGEN_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.origen && <p className="text-sm text-red-500">{errors.origen.message}</p>}
        </div>

        <div className="space-y-2">
          <Label>Estado productivo</Label>
          <Select
            value={estadoProductivoValue ?? ""}
            onValueChange={(val) => setValue("estado_productivo", val)}
            disabled={!sexoValue}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={sexoValue ? "Seleccionar estado" : "Primero selecciona el sexo"}
              />
            </SelectTrigger>
            <SelectContent>
              {estadosProductivosDisponibles.map((value) => (
                <SelectItem key={value} value={value}>
                  {ESTADO_PRODUCTIVO_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.estado_productivo && (
            <p className="text-sm text-red-500">{errors.estado_productivo.message}</p>
          )}
        </div>
      </div>

      {/* El ciclo reproductivo solo aplica a hembras y normalmente lo mueven los eventos */}
      {sexoValue === "hembra" && (
        <div className="space-y-2">
          <Label>Estado reproductivo</Label>
          <Select
            value={estadoReproductivoValue ?? "none"}
            onValueChange={(val) => setValue("estado_reproductivo", val === "none" ? null : val)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Sin definir" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin definir</SelectItem>
              {ESTADOS_REPRODUCTIVOS.map((value) => (
                <SelectItem key={value} value={value}>
                  {ESTADO_REPRODUCTIVO_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-400">
            Se actualiza solo al registrar inseminaciones, palpaciones y partos. Cámbialo a mano
            únicamente para corregir el punto de partida.
          </p>
          {errors.estado_reproductivo && (
            <p className="text-sm text-red-500">{errors.estado_reproductivo.message}</p>
          )}
        </div>
      )}

      {/* Concentrado por ordeño: solo hembras, a un macho no se le ordeña. */}
      {sexoValue === "hembra" && (
        <div className="space-y-2">
          <Label htmlFor="concentrado_por_ordeno">Concentrado por ordeño</Label>
          <Input
            id="concentrado_por_ordeno"
            type="number"
            step="0.1"
            min="0"
            max="100"
            placeholder="Ej: 2 (opcional)"
            {...register("concentrado_por_ordeno", {
              // El input vacío llega como "" y `valueAsNumber` lo convertiría en NaN,
              // que Zod rechaza. Se normaliza a null = "sin definir".
              setValueAs: (v) => (v === "" || v === null ? null : Number(v)),
            })}
          />
          <p className="text-xs text-gray-400">
            Cantidad que se le da en cada ordeño del día, no el total diario.
          </p>
          {errors.concentrado_por_ordeno && (
            <p className="text-sm text-red-500">{errors.concentrado_por_ordeno.message}</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label>Fecha de nacimiento</Label>
        <DatePicker
          value={fechaNacimientoValue ?? undefined}
          onChange={(date) => setValue("fecha_nacimiento", date)}
          placeholder="Seleccionar fecha de nacimiento"
        />
      </div>

      {origenValue === "externa" && (
        <>
          <div className="space-y-2">
            <Label>Fecha de compra</Label>
            <DatePicker
              value={fechaCompraValue ?? undefined}
              onChange={(date) => setValue("fecha_compra", date)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="madre_externa_nombre">Nombre de la madre</Label>
            <Input
              id="madre_externa_nombre"
              type="text"
              placeholder="Nombre de la madre (opcional)"
              {...register("madre_externa_nombre")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="padre_externo_nombre">Nombre del padre</Label>
            <Input
              id="padre_externo_nombre"
              type="text"
              placeholder="Nombre del padre (opcional)"
              {...register("padre_alquiler_nombre")}
            />
          </div>
        </>
      )}

      {origenValue === "finca" && (
        <>
          {/* Madre */}
          <div className="space-y-2">
            <Label>Madre</Label>
            <Select
              value={madreIdValue ?? "none"}
              onValueChange={(val) => setValue("madre_id", val === "none" ? null : val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sin madre registrada" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin madre registrada</SelectItem>
                {madresDisponibles.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    #{m.identificador} — {m.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo de padre */}
          <div className="space-y-2">
            <Label>Padre</Label>
            <div className="flex gap-2">
              {(["none", "animal", "pajilla", "alquiler"] as PadreTipo[])
                .filter((tipo) => tipo !== "pajilla" || sexoValue === "hembra")
                .map((tipo) => (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => handlePadreTipoChange(tipo)}
                    className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                      padreTipo === tipo
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    {PADRE_TIPO_LABELS[tipo]}
                  </button>
                ))}
            </div>
          </div>

          {/* Macho de finca */}
          {padreTipo === "animal" && (
            <div className="space-y-2">
              <Select
                value={padreIdValue ?? "none"}
                onValueChange={(val) => setValue("padre_id", val === "none" ? null : val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar padre" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin padre seleccionado</SelectItem>
                  {padresDisponibles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      #{p.identificador} — {p.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Pajilla (solo disponible para hembras) */}
          {padreTipo === "pajilla" && (
            <div className="space-y-2">
              {animal?.padre_pajilla_nombre && !selectedPajillaToro && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                  <p className="text-xs text-blue-600 font-medium">Padre actual por pajilla</p>
                  <p className="text-sm text-blue-800 font-semibold">{animal.padre_pajilla_nombre}</p>
                  <p className="text-xs text-blue-500 mt-0.5">
                    Selecciona otra pajilla abajo para cambiarlo
                  </p>
                </div>
              )}
              {lotesParaPadre.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="text-sm text-amber-700">
                    No hay lotes de pajillas registrados en el inventario.
                  </p>
                </div>
              ) : (
                <Select
                  value={selectedPajillaToro || "none"}
                  onValueChange={(val) => setSelectedPajillaToro(val === "none" ? "" : val)}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        animal?.padre_pajilla_nombre
                          ? "Cambiar pajilla (opcional)..."
                          : "Seleccionar lote de la pajilla"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      {animal?.padre_pajilla_nombre ? "Mantener actual" : "Sin selección"}
                    </SelectItem>
                    {lotesParaPadre.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.toro_nombre}{" "}
                        <span className="text-gray-400">
                          ({p.toro_ref_id}) — {p.cantidad_disponible} disponible(s)
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Toro de alquiler: monta natural con un toro externo, solo se registran nombre y raza */}
          {padreTipo === "alquiler" && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="text"
                  placeholder="Nombre del toro de alquiler (ej: Aurora)"
                  {...register("padre_alquiler_nombre")}
                />
                <Select
                  value={watch("padre_alquiler_raza") ?? "none"}
                  onValueChange={(val) =>
                    setValue("padre_alquiler_raza", val === "none" ? null : (val as AnimalRaza))
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
              <p className="text-xs text-gray-400">
                Para toros de monta natural que no son de la finca ni vinieron de una pajilla.
              </p>
            </div>
          )}
        </>
      )}

      <div className="flex gap-2 pt-4">
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : animal ? "Actualizar" : "Crear"}
        </Button>
      </div>
    </form>
  );
}
