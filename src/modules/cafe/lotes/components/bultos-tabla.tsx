import { Check } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { quedaDisponible } from "../lib/etapas";
import { formatearKg3 } from "../lib/formato";
import { ORDEN_PROCESO, etiquetaServicio } from "../lib/servicios";
import type { BultoFicha } from "../queries/lotes.queries";
import type { TipoProceso } from "../types";

const PASOS: TipoProceso[] = (Object.keys(ORDEN_PROCESO) as TipoProceso[]).sort((a, b) => ORDEN_PROCESO[a] - ORDEN_PROCESO[b]);

/**
 * Cada bulto con su peso original, en qué pasos ya estuvo y cuánto pesa ahora (`v_bultos_estado`), y al pie lo que
 * queda disponible según el último paso de cada bulto («Queda disponible: 332,000 kg tostado»).
 */
export function BultosTabla({ bultos, pasosDelLote }: { bultos: BultoFicha[]; pasosDelLote: readonly TipoProceso[] }) {
  const pasos = PASOS.filter((p) => pasosDelLote.includes(p) || bultos.some((b) => b.pasos.includes(p)));
  const disponible = quedaDisponible(bultos);

  return (
    <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bulto</TableHead>
              <TableHead className="text-right">Peso original</TableHead>
              {pasos.map((p) => (
                <TableHead key={p} className="text-center">
                  {etiquetaServicio(p)}
                </TableHead>
              ))}
              <TableHead className="text-right">Peso actual</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bultos.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium tabular-nums">Bulto {b.numero}</TableCell>
                <TableCell className="text-right tabular-nums">{formatearKg3(b.pesoKg)}</TableCell>
                {pasos.map((p) => (
                  <TableCell key={p} className="text-center">
                    {b.pasos.includes(p) ? (
                      <>
                        <Check className="mx-auto h-4 w-4 text-emerald-600" aria-hidden />
                        <span className="sr-only">Sí</span>
                      </>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </TableCell>
                ))}
                <TableCell className="text-right tabular-nums">{formatearKg3(b.pesoActualKg)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="border-t border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-gray-700">
        <span className="font-medium">Queda disponible: </span>
        {disponible.length === 0
          ? "—"
          : disponible.map((d, i) => (
              <span key={d.paso ?? "sin"} className="tabular-nums">
                {i > 0 && " · "}
                {formatearKg3(d.pesoKg)} kg {d.texto}
              </span>
            ))}
      </p>
    </div>
  );
}
