import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatearCOP, formatearKg } from "@/modules/cafe/compras/lib/compra";
import type { LoteReciente } from "../queries/lotes.queries";

/** `2026-11-05` → `05/11/2026`, sin pasar por `Date` (correría un día en UTC-5). */
function fechaCorta(ymd: string): string {
  const [a, m, d] = ymd.split("-");
  return `${d}/${m}/${a}`;
}

/** Lista mínima de lotes recientes (código, línea, tercero, tipo, fecha, kg, bultos, valor de compra). */
export function LotesTable({ lotes }: { lotes: LoteReciente[] }) {
  if (lotes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">
        Aún no hay lotes registrados.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Línea</TableHead>
            <TableHead>Proveedor / cliente</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead className="text-right">Kg</TableHead>
            <TableHead className="text-right">Bultos</TableHead>
            <TableHead className="text-right">Valor compra</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lotes.map((l) => (
            <TableRow key={l.id} className={cn(l.anulado && "opacity-60")}>
              <TableCell className="font-medium tabular-nums text-gray-800">
                {l.codigo}
                {l.anulado && <Badge className="ml-2 bg-red-100 text-red-700 hover:bg-red-100">Anulado</Badge>}
              </TableCell>
              <TableCell>
                {l.linea === "marca_propia" ? (
                  <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Marca propia</Badge>
                ) : (
                  <Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100">Servicio</Badge>
                )}
              </TableCell>
              <TableCell>{l.tercero}</TableCell>
              <TableCell>{l.tipoCafe ?? "—"}</TableCell>
              <TableCell className="tabular-nums">{fechaCorta(l.fechaRecepcion)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatearKg(l.pesoKg)}</TableCell>
              <TableCell className="text-right tabular-nums">{l.numBultos}</TableCell>
              <TableCell className="text-right tabular-nums">{l.valorCompra === null ? "—" : formatearCOP(l.valorCompra)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
