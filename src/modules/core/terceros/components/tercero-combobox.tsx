"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { EntityModal } from "@/components/shared/entity-modal";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { listarOpcionesTerceros } from "../actions/terceros.actions";
import type { RolTercero } from "../lib/roles";
import type { Tercero, TerceroOpcion } from "../types";
import { TerceroForm } from "./tercero-form";

export interface TerceroComboboxProps {
  /** Id del tercero seleccionado (`null` = ninguno). */
  value: string | null;
  /** Se llama con el id elegido y el tercero completo (también cuando se crea uno nuevo en línea). */
  onChange: (id: string, tercero: TerceroOpcion) => void;
  /** Solo terceros con este rol (p. ej. `"proveedor"` en una recepción, `"cliente"` en una venta). */
  rol?: RolTercero;
  /** Muestra «Crear tercero» (abre el formulario) y deja el nuevo seleccionado, sin recargar. */
  permitirCrear?: boolean;
  /** Incluye el «Consumidor final» entre las opciones (ventas al público). */
  incluirConsumidorFinal?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

function aOpcion(t: Tercero): TerceroOpcion {
  const { id, nombre, tipo_identificacion, identificacion, digito_verificacion, roles, es_consumidor_final, activo } = t;
  return { id, nombre, tipo_identificacion, identificacion, digito_verificacion, roles, es_consumidor_final, activo };
}

/**
 * Selector de terceros reutilizable (patrón de `components/shared/finca-combobox.tsx`). Carga las
 * opciones del cliente actual por Server Action al montarse y filtra en el navegador. Con `permitirCrear`,
 * si lo buscado no existe ofrece crearlo en línea desde el mismo desplegable.
 *
 * Quien lo use desde otro módulo lo importa directamente de este fichero (no del barril `@/modules/core`).
 */
export function TerceroCombobox({
  value,
  onChange,
  rol,
  permitirCrear = false,
  incluirConsumidorFinal = false,
  placeholder = "Selecciona un tercero",
  disabled = false,
}: TerceroComboboxProps) {
  const [open, setOpen] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  // Lo último cargado y para qué filtros fue (`clave`); mientras no coincida con los actuales, «cargando».
  const [carga, setCarga] = useState<{ clave: string; error: string | null; opciones: TerceroOpcion[] } | null>(null);
  // Terceros creados o elegidos en esta sesión con los filtros actuales: se muestran aunque el listado
  // cargado no los incluya (acaban de nacer, o son «el existente» que el aviso de duplicados propuso).
  const [agregados, setAgregados] = useState<{ clave: string; opciones: TerceroOpcion[] }>({ clave: "", opciones: [] });
  const [creando, setCreando] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");

  const clave = `${rol ?? ""}|${incluirConsumidorFinal}`;
  const cargando = carga?.clave !== clave;
  const error = carga?.clave === clave ? carga.error : null;
  const opciones = useMemo(() => {
    const base = carga?.clave === clave ? carga.opciones : [];
    const ids = new Set(base.map((o) => o.id));
    const extra = agregados.clave === clave ? agregados.opciones.filter((o) => !ids.has(o.id)) : [];
    return [...base, ...extra];
  }, [carga, agregados, clave]);

  useEffect(() => {
    let vigente = true;
    listarOpcionesTerceros({ rol, incluirConsumidorFinal }).then((r) => {
      if (vigente) setCarga({ clave, error: r.ok ? null : r.message, opciones: r.ok ? r.data : [] });
    });
    return () => {
      vigente = false;
    };
  }, [clave, rol, incluirConsumidorFinal]);

  const seleccionado = opciones.find((o) => o.id === value) ?? null;

  function elegir(opcion: TerceroOpcion) {
    setAgregados((previos) => ({
      clave,
      opciones: [...(previos.clave === clave ? previos.opciones : []).filter((o) => o.id !== opcion.id), opcion],
    }));
    onChange(opcion.id, opcion);
    setOpen(false);
    setCreando(false);
  }

  function abrirCreacion() {
    setNombreNuevo(busqueda.trim());
    setOpen(false);
    setCreando(true);
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className={cn("truncate", !seleccionado && "text-muted-foreground")}>
              {seleccionado ? seleccionado.nombre : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start" side="bottom">
          <Command>
            <CommandInput placeholder="Buscar por nombre o identificación..." value={busqueda} onValueChange={setBusqueda} />
            <CommandList>
              <CommandEmpty>
                {cargando ? "Cargando…" : (error ?? "Sin resultados.")}
              </CommandEmpty>
              {opciones.map((o) => (
                <CommandItem
                  key={o.id}
                  // El valor incluye la identificación para que cmdk también filtre por ella.
                  value={`${o.nombre} ${o.identificacion}`}
                  onSelect={() => elegir(o)}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === o.id ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 truncate">
                    {o.nombre}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {o.es_consumidor_final ? "Consumidor final" : `${o.tipo_identificacion} ${o.identificacion}`}
                    </span>
                  </span>
                </CommandItem>
              ))}
              {permitirCrear && (
                <CommandItem forceMount value="__crear_tercero__" onSelect={abrirCreacion} className="border-t">
                  <Plus className="mr-2 h-4 w-4" />
                  {busqueda.trim() ? `Crear tercero «${busqueda.trim()}»` : "Crear tercero"}
                </CommandItem>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {permitirCrear && (
        <EntityModal open={creando} onClose={() => setCreando(false)} title="Nuevo tercero">
          {/* `key` fuerza un formulario limpio cada vez que se abre. */}
          <TerceroForm
            key={`${creando}-${nombreNuevo}`}
            nombreInicial={nombreNuevo}
            rolesIniciales={rol ? [rol] : undefined}
            onSuccess={(t) => elegir(aOpcion(t))}
            onUsarExistente={(t) => elegir(aOpcion(t))}
          />
        </EntityModal>
      )}
    </>
  );
}
