"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  actualizarTenant,
  agregarMiembroTenant,
  quitarMiembroTenant,
  setModuloTenant,
} from "../actions/platform.actions";
import {
  ESTADOS_TENANT,
  ETIQUETA_ESTADO,
  ETIQUETA_ROL_MIEMBRO,
  ETIQUETA_VERTICAL,
  ROLES_MIEMBRO,
} from "../lib/nucleo";
import {
  actualizarTenantSchema,
  agregarMiembroSchema,
  type ActualizarTenantDatos,
  type ActualizarTenantInput,
  type AgregarMiembroInput,
} from "../schemas/platform.schema";
import type { TenantDetalle } from "../types";

const CLASE_SELECT =
  "border-input h-9 w-full rounded-md border bg-transparent px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm";

export function TenantDetalleView({ detalle }: { detalle: TenantDetalle }) {
  const { tenant } = detalle;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{tenant.nombre}</h1>
        <p className="text-muted-foreground text-sm">
          {tenant.slug} · {ETIQUETA_VERTICAL[tenant.vertical]} · {tenant.zona_horaria} · {tenant.moneda}
        </p>
      </div>
      <DatosCard detalle={detalle} />
      <ModulosCard detalle={detalle} />
      <MiembrosCard detalle={detalle} />
    </div>
  );
}

function DatosCard({ detalle }: { detalle: TenantDetalle }) {
  const { tenant } = detalle;
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ActualizarTenantInput, unknown, ActualizarTenantDatos>({
    resolver: zodResolver(actualizarTenantSchema),
    defaultValues: {
      nombre: tenant.nombre,
      estado: tenant.estado,
      plan: tenant.plan,
      nit: tenant.nit ?? "",
      logo_url: tenant.logo_url ?? "",
      color_primario: tenant.color_primario ?? "",
    },
  });

  const onSubmit = async (datos: ActualizarTenantDatos) => {
    const r = await actualizarTenant(tenant.id, datos);
    if (!r.ok) return void toast.error(r.message);
    toast.success("Datos guardados");
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Datos y marca</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="nombre">Nombre</Label>
            <Input id="nombre" {...register("nombre")} />
            {errors.nombre && <p className="text-destructive text-sm">{errors.nombre.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="nit">NIT</Label>
            <Input id="nit" {...register("nit")} />
            {errors.nit && <p className="text-destructive text-sm">{errors.nit.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="estado">Estado</Label>
            <select id="estado" className={CLASE_SELECT} {...register("estado")}>
              {ESTADOS_TENANT.map((e) => (
                <option key={e} value={e}>
                  {ETIQUETA_ESTADO[e]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="plan">Plan</Label>
            <Input id="plan" {...register("plan")} />
            {errors.plan && <p className="text-destructive text-sm">{errors.plan.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="logo_url">URL del logo</Label>
            <Input id="logo_url" {...register("logo_url")} placeholder="https://…" />
            {errors.logo_url && <p className="text-destructive text-sm">{errors.logo_url.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="color_primario">Color primario</Label>
            <Input id="color_primario" {...register("color_primario")} placeholder="#1A7F5A" />
            {errors.color_primario && <p className="text-destructive text-sm">{errors.color_primario.message}</p>}
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ModulosCard({ detalle }: { detalle: TenantDetalle }) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [cambiando, setCambiando] = useState<string | null>(null);

  const alternar = (id: string, activo: boolean) => {
    setCambiando(id);
    empezar(async () => {
      const r = await setModuloTenant(detalle.tenant.id, id, activo);
      setCambiando(null);
      if (!r.ok) return void toast.error(r.message);
      toast.success(activo ? "Módulo activado" : "Módulo desactivado");
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Módulos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-muted-foreground text-xs">
          Vertical del cliente y núcleo. El cambio se ve en el cliente al recargar.
        </p>
        {detalle.modulos.map((m) => (
          <label key={m.id} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={m.activo}
              disabled={pendiente && cambiando === m.id}
              onChange={(e) => alternar(m.id, e.target.checked)}
            />
            <span>
              {m.nombre} <span className="text-muted-foreground text-xs">({m.id})</span>
              {m.base && (
                <Badge variant="secondary" className="ml-2">
                  base
                </Badge>
              )}
              {m.descripcion && <span className="text-muted-foreground block text-xs">{m.descripcion}</span>}
            </span>
          </label>
        ))}
      </CardContent>
    </Card>
  );
}

function MiembrosCard({ detalle }: { detalle: TenantDetalle }) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AgregarMiembroInput>({
    resolver: zodResolver(agregarMiembroSchema),
    defaultValues: { email: "", rol: "owner" },
  });

  const onSubmit = async (datos: AgregarMiembroInput) => {
    const r = await agregarMiembroTenant(detalle.tenant.id, datos);
    if (!r.ok) return void toast.error(r.message);
    toast.success("Miembro añadido");
    reset({ email: "", rol: datos.rol });
    router.refresh();
  };

  const quitar = (userId: string, email: string | null) => {
    if (!window.confirm(`¿Quitar a ${email ?? "este usuario"} del cliente?`)) return;
    empezar(async () => {
      const r = await quitarMiembroTenant(detalle.tenant.id, userId);
      if (!r.ok) return void toast.error(r.message);
      toast.success("Miembro quitado");
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Miembros</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="divide-y rounded-md border">
          {detalle.miembros.length === 0 && (
            <p className="text-muted-foreground px-3 py-4 text-sm">Todavía no tiene miembros.</p>
          )}
          {detalle.miembros.map((m) => (
            <div key={m.user_id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <div>
                <span className={m.activo ? "" : "text-muted-foreground line-through"}>{m.email ?? m.user_id}</span>
                <span className="text-muted-foreground ml-2 text-xs">
                  {ETIQUETA_ROL_MIEMBRO[m.rol]}
                  {!m.activo && " · inactivo"}
                </span>
              </div>
              {m.activo && (
                <Button variant="outline" size="sm" disabled={pendiente} onClick={() => quitar(m.user_id, m.email)}>
                  Quitar
                </Button>
              )}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-wrap items-start gap-2">
          <div className="min-w-56 flex-1 space-y-1">
            <Label htmlFor="email-miembro">Email de un usuario existente</Label>
            <Input id="email-miembro" type="email" {...register("email")} placeholder="persona@empresa.com" />
            {errors.email && <p className="text-destructive text-sm">{errors.email.message}</p>}
          </div>
          <div className="w-44 space-y-1">
            <Label htmlFor="rol-miembro">Rol</Label>
            <select id="rol-miembro" className={CLASE_SELECT} {...register("rol")}>
              {ROLES_MIEMBRO.map((r) => (
                <option key={r} value={r}>
                  {ETIQUETA_ROL_MIEMBRO[r]}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" className="mt-6" disabled={isSubmitting}>
            {isSubmitting ? "Añadiendo…" : "Añadir"}
          </Button>
        </form>
        <p className="text-muted-foreground text-xs">
          El usuario debe tener cuenta (créala o invítalo antes desde Supabase → Authentication). En clientes de
          ganadería también se le asigna el rol equivalente de las pantallas existentes.
        </p>
      </CardContent>
    </Card>
  );
}
