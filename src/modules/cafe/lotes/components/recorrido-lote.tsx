import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EstadoPaso, PasoRecorrido } from "../lib/recorrido";

const TEXTO: Record<EstadoPaso, string> = { completo: "completo", parcial: "en curso", pendiente: "pendiente", futuro: "aún no toca" };
const ESTILO: Record<EstadoPaso, string> = {
  completo: "border-slate-900 bg-slate-900 text-white",
  parcial: "border-2 border-slate-900 bg-white text-slate-900 hover:bg-slate-50",
  pendiente: "border-2 border-slate-900 bg-white text-slate-900 hover:bg-slate-50",
  futuro: "border-stone-200 bg-stone-100 text-stone-500",
};

/**
 * Recorrido del lote en fichas: las completas van oscuras, las parciales o pendientes son enlaces a la planta en ese
 * paso (si quien mira puede operar) y las futuras van grises. El estado se dice también con palabras para lectores
 * de pantalla.
 */
export function RecorridoLote({ pasos }: { pasos: PasoRecorrido[] }) {
  return (
    <section aria-labelledby="titulo-recorrido" className="space-y-2">
      <h2 id="titulo-recorrido" className="sr-only">
        Recorrido
      </h2>
      <ol className="grid grid-cols-2 gap-3 sm:flex sm:overflow-x-auto sm:pb-1">
        {pasos.map((p) => {
          const clases = cn("flex min-h-14 flex-col justify-center rounded-lg border px-4 py-2 sm:min-w-44 sm:shrink-0", ESTILO[p.estado]);
          const contenido = (
            <>
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                {p.etiqueta}
                {p.href && <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />}
              </span>
              <span className="text-xs">
                {p.detalle}
                <span className="sr-only"> ({TEXTO[p.estado]})</span>
              </span>
            </>
          );
          return (
            <li key={p.clave} className="contents sm:block">
              {p.href ? (
                <Link href={p.href} className={clases}>
                  {contenido}
                </Link>
              ) : (
                <div className={clases}>{contenido}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
