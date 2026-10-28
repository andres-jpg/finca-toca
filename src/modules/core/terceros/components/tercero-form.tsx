"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { actualizarTercero, buscarSimilares, crearTercero } from "../actions/terceros.actions";
import {
  ETIQUETA_ROL_TERCERO,
  ETIQUETA_TIPO_IDENTIFICACION,
  ROLES_TERCERO,
  TIPOS_IDENTIFICACION,
  type RolTercero,
} from "../lib/roles";
import { terceroSchema, type TerceroFormInput, type TerceroInput } from "../schemas/tercero.schema";
import type { Tercero } from "../types";

const CLASE_SELECT =
  "border-input h-9 w-full rounded-md border bg-transparent px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm";

export interface TerceroFormProps {
  /** Presente = modo edición. */
  tercero?: Tercero;
  /** Precarga el nombre (el combobox pasa lo que el usuario buscó sin encontrar). */
  nombreInicial?: string;
  /** Roles marcados al crear (el combobox pasa el rol que filtra). */
  rolesIniciales?: RolTercero[];
  onSuccess: (tercero: Tercero) => void;
  /**
   * Si se informa, el aviso de duplicados ofrece «¿Usar este?» para quedarse con el tercero existente en
   * vez de crear otro (el combobox lo usa para seleccionarlo).
   */
  onUsarExistente?: (tercero: Tercero) => void;
}

export function TerceroForm({ tercero, nombreInicial, rolesIniciales, onSuccess, onUsarExistente }: TerceroFormProps) {
  const esEdicion = !!tercero;
  const [similares, setSimilares] = useState<Tercero[]>([]);
  // Ids de los parecidos que el usuario ya vio: el primer intento de guardar con uno nuevo se detiene
  // para mostrarlo; el segundo sigue adelante (puede ser legítimo: dos razones sociales parecidas).
  // (Un Set estable en el estado, no un ref: el compilador de React no deja pasar refs al `handleSubmit`.)
  const [vistos] = useState(() => new Set<string>());

  const {
    register,
    handleSubmit,
    control,
    getValues,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TerceroFormInput, unknown, TerceroInput>({
    resolver: zodResolver(terceroSchema),
    defaultValues: {
      tipo_identificacion: tercero?.tipo_identificacion ?? "NIT",
      identificacion: tercero?.identificacion ?? "",
      digito_verificacion: tercero?.digito_verificacion ?? "",
      nombre: tercero?.nombre ?? nombreInicial ?? "",
      direccion: tercero?.direccion ?? "",
      telefono: tercero?.telefono ?? "",
      email: tercero?.email ?? "",
      roles: tercero?.roles ?? rolesIniciales ?? [],
      observaciones: tercero?.observaciones ?? "",
    },
  });

  // Al salir de nombre o identificación se busca duplicados; el `onBlur` de RHF se conserva.
  const campoNombre = register("nombre");
  const campoIdentificacion = register("identificacion");

  const tipo = useWatch({ control, name: "tipo_identificacion" });
  const roles = useWatch({ control, name: "roles" }) ?? [];

  /**
   * Busca terceros parecidos al que se escribe y actualiza el aviso. Devuelve `true` si hay alguno que el
   * usuario aún no había visto.
   */
  async function revisarDuplicados(): Promise<boolean> {
    const { nombre, identificacion } = getValues();
    const r = await buscarSimilares({ nombre, identificacion });
    if (!r.ok) return false; // el aviso es una ayuda: si falla, el guardado sigue y la base manda
    const encontrados = r.data.filter((t) => t.id !== tercero?.id);
    setSimilares(encontrados);
    const hayNuevos = encontrados.some((t) => !vistos.has(t.id));
    encontrados.forEach((t) => vistos.add(t.id));
    return hayNuevos;
  }

  function alternarRol(rol: RolTercero, marcado: boolean) {
    const siguiente = marcado ? [...new Set([...roles, rol])] : roles.filter((r) => r !== rol);
    setValue("roles", siguiente, { shouldValidate: true, shouldDirty: true });
  }

  const onSubmit = async (values: TerceroInput) => {
    if (await revisarDuplicados()) {
      toast.warning("Hay terceros parecidos. Revísalos antes de guardar.");
      return;
    }
    const r = esEdicion ? await actualizarTercero(tercero.id, values) : await crearTercero(values);
    if (!r.ok) {
      if (r.code === "duplicado") setError("identificacion", { message: r.message });
      toast.error(r.message);
      return;
    }
    toast.success(esEdicion ? "Tercero actualizado" : "Tercero creado");
    onSuccess(r.data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="tercero-nombre">Nombre o razón social</Label>
        <Input
          id="tercero-nombre"
          placeholder="Ej: Café Pepe S.A.S."
          autoComplete="off"
          {...campoNombre}
          onBlur={(e) => {
            void campoNombre.onBlur(e);
            void revisarDuplicados();
          }}
        />
        {errors.nombre && <p className="text-xs text-red-500">{errors.nombre.message}</p>}
      </div>

      <div className="grid grid-cols-[8rem_1fr] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="tercero-tipo">Tipo</Label>
          <select id="tercero-tipo" className={CLASE_SELECT} {...register("tipo_identificacion")}>
            {TIPOS_IDENTIFICACION.map((t) => (
              <option key={t} value={t} title={ETIQUETA_TIPO_IDENTIFICACION[t]}>
                {t}
              </option>
            ))}
          </select>
          {errors.tipo_identificacion && <p className="text-xs text-red-500">{errors.tipo_identificacion.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tercero-identificacion">Número de identificación</Label>
          <Input
            id="tercero-identificacion"
            placeholder="900.123.456-7"
            autoComplete="off"
            {...campoIdentificacion}
            onBlur={(e) => {
              void campoIdentificacion.onBlur(e);
              void revisarDuplicados();
            }}
          />
          {errors.identificacion && <p className="text-xs text-red-500">{errors.identificacion.message}</p>}
        </div>
      </div>

      {tipo === "NIT" && (
        <div className="space-y-1.5">
          <Label htmlFor="tercero-dv">Dígito de verificación (opcional)</Label>
          <Input
            id="tercero-dv"
            inputMode="numeric"
            maxLength={1}
            className="w-20"
            placeholder="7"
            {...register("digito_verificacion")}
          />
          {errors.digito_verificacion && <p className="text-xs text-red-500">{errors.digito_verificacion.message}</p>}
        </div>
      )}

      {similares.length > 0 && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {similares.length === 1 ? "Ya existe un tercero parecido" : "Ya existen terceros parecidos"}
          </p>
          <ul className="mt-2 space-y-2">
            {similares.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  Ya existe: <strong>{t.nombre}</strong>
                  <span className="block text-xs text-amber-800">
                    {t.tipo_identificacion} {t.identificacion}
                    {t.roles.length > 0 && ` · ${t.roles.map((r) => ETIQUETA_ROL_TERCERO[r]).join(", ")}`}
                    {!t.activo && " · inactivo"}
                  </span>
                </span>
                {onUsarExistente && (
                  <Button type="button" size="sm" variant="outline" onClick={() => onUsarExistente(t)}>
                    ¿Usar este?
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-800">
            Si es otro tercero distinto, puedes guardar igualmente.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="tercero-direccion">Dirección</Label>
        <Input id="tercero-direccion" autoComplete="off" {...register("direccion")} />
        {errors.direccion && <p className="text-xs text-red-500">{errors.direccion.message}</p>}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="tercero-telefono">Teléfono</Label>
          <Input id="tercero-telefono" type="tel" autoComplete="off" {...register("telefono")} />
          {errors.telefono && <p className="text-xs text-red-500">{errors.telefono.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tercero-email">Correo (opcional)</Label>
          <Input id="tercero-email" type="email" autoComplete="off" {...register("email")} />
          {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Roles</legend>
        {ROLES_TERCERO.map((rol) => (
          <label key={rol} className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300"
              checked={roles.includes(rol)}
              onChange={(e) => alternarRol(rol, e.target.checked)}
            />
            {ETIQUETA_ROL_TERCERO[rol]}
          </label>
        ))}
        {errors.roles && <p className="text-xs text-red-500">{errors.roles.message}</p>}
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="tercero-observaciones">Observaciones (opcional)</Label>
        <Textarea id="tercero-observaciones" rows={2} {...register("observaciones")} />
        {errors.observaciones && <p className="text-xs text-red-500">{errors.observaciones.message}</p>}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Guardando…" : esEdicion ? "Guardar cambios" : "Crear tercero"}
      </Button>
    </form>
  );
}
