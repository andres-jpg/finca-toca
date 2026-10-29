"use client";

import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * El «¿qué significa?» de una tarjeta: un botón con el icono de información que abre la definición del indicador. Es un
 * popover (se abre con un toque, también en la tablet de planta) y no un `title`, que no existe sin ratón.
 */
export function InfoDefinicion({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Qué significa: ${titulo}`}
          className="-m-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-stone-500 sm:-m-1 sm:h-8 sm:w-8"
        >
          <Info className="h-4 w-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 text-sm">
        <p className="font-semibold text-gray-800">{titulo}</p>
        <p className="mt-1 leading-relaxed text-gray-600">{texto}</p>
      </PopoverContent>
    </Popover>
  );
}
