"use client";

import { useState, useTransition } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { cambiarTenantActivo, listarTenantsPlataforma } from "../actions/tenant.actions";
import type { Vertical } from "../tenant.queries";
import { ETIQUETA_VERTICAL } from "../verticales";

export interface OpcionTenant {
  id: string;
  nombre: string;
  slug: string;
  vertical: Vertical;
}

interface TenantSwitcherProps {
  /** Cliente activo; `null` si un platform admin aún no ha elegido ninguno. */
  tenantActualId: string | null;
  tenantActualNombre: string | null;
  /** Clientes donde el usuario tiene membresía. */
  membresias: OpcionTenant[];
  esPlatformAdmin: boolean;
}

/**
 * Selector del cliente activo. Solo se monta si hay algo que elegir: más de una membresía o platform
 * admin (que además puede buscar entre todos los clientes; la lista se pide al abrir, no en cada página).
 * Cambiar de cliente es un Server Action que recarga el layout entero: no se cierra sesión.
 */
export function TenantSwitcher({
  tenantActualId,
  tenantActualNombre,
  membresias,
  esPlatformAdmin,
}: TenantSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const [todos, setTodos] = useState<OpcionTenant[] | null>(null);
  const [cargando, setCargando] = useState(false);

  // Un usuario normal elige entre sus membresías; el platform admin, entre todos los clientes.
  const opciones = esPlatformAdmin ? (todos ?? membresias) : membresias;

  async function alAbrir(abierto: boolean) {
    setOpen(abierto);
    if (!abierto || !esPlatformAdmin || todos || cargando) return;
    setCargando(true);
    const r = await listarTenantsPlataforma();
    setCargando(false);
    if (r.ok) setTodos(r.data);
    else toast.error(r.message);
  }

  function elegir(id: string) {
    if (id === tenantActualId) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      // Si funciona, el Server Action redirige y esta promesa no vuelve con valor.
      const r = await cambiarTenantActivo(id);
      if (r && !r.ok) toast.error(r.message);
    });
  }

  return (
    <Popover open={open} onOpenChange={alAbrir}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Cambiar de cliente"
          disabled={pendiente}
          className="h-8 max-w-[220px] justify-between gap-2 px-2.5 text-xs font-medium"
        >
          <span className="truncate">{tenantActualNombre ?? "Elegir cliente"}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <Command>
          <CommandInput placeholder="Buscar cliente…" />
          <CommandList>
            <CommandEmpty>{cargando ? "Cargando clientes…" : "Sin resultados."}</CommandEmpty>
            <CommandGroup heading={esPlatformAdmin ? "Todos los clientes" : "Tus clientes"}>
              {opciones.map((t) => (
                <CommandItem
                  key={t.id}
                  // cmdk filtra por `value`: nombre y slug, para encontrarlo por cualquiera de los dos.
                  value={`${t.nombre} ${t.slug}`}
                  onSelect={() => elegir(t.id)}
                  className="gap-2"
                >
                  <Check
                    className={cn("h-4 w-4 shrink-0", t.id === tenantActualId ? "opacity-100" : "opacity-0")}
                  />
                  <span className="min-w-0 flex-1 truncate">{t.nombre}</span>
                  <Badge variant="secondary" className="shrink-0">
                    {ETIQUETA_VERTICAL[t.vertical]}
                  </Badge>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
