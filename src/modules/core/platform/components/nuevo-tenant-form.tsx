"use client";

import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { crearTenant } from "../actions/platform.actions";
import { ETIQUETA_VERTICAL, NUCLEO_POR_DEFECTO, VERTICALES } from "../lib/nucleo";
import { crearTenantSchema, type CrearTenantDatos, type CrearTenantInput } from "../schemas/platform.schema";
import type { ModuloCatalogo } from "../types";

const CLASE_SELECT =
  "border-input h-9 w-full rounded-md border bg-transparent px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm";

/** Slug sugerido a partir del nombre: sin tildes, minúsculas, guiones. */
function sugerirSlug(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function NuevoTenantForm({ catalogo }: { catalogo: ModuloCatalogo[] }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<CrearTenantInput, unknown, CrearTenantDatos>({
    resolver: zodResolver(crearTenantSchema),
    defaultValues: { nombre: "", slug: "", vertical: "cafe", nit: "", plan: "pro", modulos: [] },
  });

  const vertical = useWatch({ control, name: "vertical" });
  const elegidos = useWatch({ control, name: "modulos" }) ?? [];

  // Opcionales: los de su vertical y de núcleo que NO vienen ya con el alta.
  const automaticos = new Set<string>([
    ...catalogo.filter((m) => m.vertical === vertical && m.base).map((m) => m.id),
    ...(NUCLEO_POR_DEFECTO[vertical] ?? []),
  ]);
  const opcionales = catalogo.filter((m) => (m.vertical === null || m.vertical === vertical) && !automaticos.has(m.id));

  const alternar = (id: string) =>
    setValue("modulos", elegidos.includes(id) ? elegidos.filter((x) => x !== id) : [...elegidos, id]);

  const onSubmit = async (datos: CrearTenantDatos) => {
    const r = await crearTenant(datos);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success("Cliente creado");
    router.push(`/admin/tenants/${r.data.id}`);
  };

  const nombre = register("nombre");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-4">
      <div className="space-y-1">
        <Label htmlFor="nombre">Nombre</Label>
        <Input
          id="nombre"
          {...nombre}
          onChange={(e) => {
            void nombre.onChange(e);
            // Mientras no haya escrito el identificador a mano, lo sugiere a partir del nombre.
            if (!dirtyFields.slug) setValue("slug", sugerirSlug(e.target.value));
          }}
        />
        {errors.nombre && <p className="text-destructive text-sm">{errors.nombre.message}</p>}
      </div>

      <div className="space-y-1">
        <Label htmlFor="slug">Identificador (slug)</Label>
        <Input id="slug" {...register("slug")} autoComplete="off" />
        <p className="text-muted-foreground text-xs">Minúsculas, números y guiones. No se puede cambiar después.</p>
        {errors.slug && <p className="text-destructive text-sm">{errors.slug.message}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="vertical">Vertical</Label>
          <select
            id="vertical"
            className={CLASE_SELECT}
            {...register("vertical", { onChange: () => setValue("modulos", []) })}
          >
            {VERTICALES.map((v) => (
              <option key={v} value={v}>
                {ETIQUETA_VERTICAL[v]}
              </option>
            ))}
          </select>
          {errors.vertical && <p className="text-destructive text-sm">{errors.vertical.message}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="nit">NIT</Label>
          <Input id="nit" {...register("nit")} />
          {errors.nit && <p className="text-destructive text-sm">{errors.nit.message}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="plan">Plan</Label>
          <Input id="plan" {...register("plan")} />
          {errors.plan && <p className="text-destructive text-sm">{errors.plan.message}</p>}
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Módulos opcionales</legend>
        <p className="text-muted-foreground text-xs">
          Los módulos base del vertical{vertical === "cafe" ? " y los de núcleo (Terceros, Auditoría)" : ""} se activan
          siempre. Se pueden cambiar después desde el detalle del cliente.
        </p>
        {opcionales.length === 0 && <p className="text-muted-foreground text-sm">No hay módulos opcionales.</p>}
        {opcionales.map((m) => (
          <label key={m.id} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={elegidos.includes(m.id)}
              onChange={() => alternar(m.id)}
            />
            <span>
              {m.nombre} <span className="text-muted-foreground text-xs">({m.id})</span>
              {m.descripcion && <span className="text-muted-foreground block text-xs">{m.descripcion}</span>}
            </span>
          </label>
        ))}
      </fieldset>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creando…" : "Crear cliente"}
      </Button>
    </form>
  );
}
