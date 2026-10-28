import { cn } from "@/lib/utils";
import { etiquetaTueste } from "../../lotes/lib/servicios";
import type { NivelTueste } from "../../lotes/types";

/** Color del nivel de tueste: claro → ámbar, medio → naranja, alto → café oscuro. El texto siempre lo dice también. */
export const CLASES_TUESTE: Readonly<Record<NivelTueste, string>> = {
  bajo: "border-amber-300 bg-amber-100 text-amber-900",
  medio: "border-orange-400 bg-orange-200 text-orange-950",
  alto: "border-stone-900 bg-stone-800 text-stone-50",
};

/** Etiqueta «Tueste medio» con el color de su nivel: en maquila la planta lo ve de un vistazo (HU-03 c2). */
export function NivelTuesteChip({ nivel, className }: { nivel: NivelTueste; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-1 text-sm font-semibold",
        CLASES_TUESTE[nivel],
        className,
      )}
    >
      Tueste {etiquetaTueste(nivel).toLowerCase()}
    </span>
  );
}
