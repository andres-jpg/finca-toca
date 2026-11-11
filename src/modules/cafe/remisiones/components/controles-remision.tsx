"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ControlesRemisionProps {
  copias: number;
  ancho: 58 | 80;
  /** `true` si `?ancho=` fuerza un rollo distinto al del cliente: se conserva en los enlaces. */
  anchoForzado: boolean;
  hrefVolver: string;
}

const BOTON = cn(buttonVariants({ size: "lg" }), "h-11 flex-1 text-base");

/**
 * Barra superior de la vista de impresión (B-17): «Imprimir» y «Volver a Planta» del mismo tamaño y, debajo, los
 * selectores de copia y de ancho. Solo se ve en pantalla (`.no-print`). Al cerrar el diálogo de impresión
 * (`afterprint`) el foco queda en «Volver a Planta».
 */
export function ControlesRemision({ copias, ancho, anchoForzado, hrefVolver }: ControlesRemisionProps) {
  const volverRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const alTerminar = () => volverRef.current?.focus();
    window.addEventListener("afterprint", alTerminar);
    return () => window.removeEventListener("afterprint", alTerminar);
  }, []);

  const href = (c: number, a: 58 | 80 | null) => `?copias=${c}${a ? `&ancho=${a}` : ""}`;
  const anchoActual = anchoForzado ? ancho : null;
  const opcion = (activa: boolean) => cn("rounded border px-2 py-1", activa ? "border-black bg-black font-bold text-white" : "border-gray-400 underline");

  return (
    <div className="no-print mb-3 space-y-2 border-b border-dashed border-black pb-3 font-sans text-xs">
      <div className="flex gap-2">
        <button type="button" onClick={() => window.print()} className={cn(BOTON, "cursor-pointer")}>
          <Printer className="size-4" aria-hidden />
          {copias > 1 ? "Imprimir con copia" : "Imprimir"}
        </button>
        <Link ref={volverRef} href={hrefVolver} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 flex-1 text-base")}>
          <ArrowLeft className="size-4" aria-hidden />
          Volver a Planta
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-2" aria-label="Formato del tiquete">
        <a className={opcion(copias === 1)} href={href(1, anchoActual)} aria-current={copias === 1 ? "true" : undefined}>Original</a>
        <a className={opcion(copias > 1)} href={href(2, anchoActual)} aria-current={copias > 1 ? "true" : undefined}>Con copia</a>
        <span className="mx-1 text-gray-400" aria-hidden>|</span>
        <a className={opcion(ancho === 80)} href={href(copias, 80)} aria-current={ancho === 80 ? "true" : undefined}>80 mm</a>
        <a className={opcion(ancho === 58)} href={href(copias, 58)} aria-current={ancho === 58 ? "true" : undefined}>58 mm</a>
      </div>
      <p className="text-gray-600">Controles solo en pantalla; no se imprimen.</p>
    </div>
  );
}
