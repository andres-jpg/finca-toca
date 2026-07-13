"use client";

import { useMemo, useState } from "react";
import { Droplets, DollarSign, Building2, ListChecks } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import type { Recoleccion } from "@/types";

type GroupBy = "finca" | "ruta" | "itinerario";

interface GroupRow {
  id: string;
  nombre: string;
  fincasCount: number;
  registros: number;
  litros: number;
  valor: number;
}

const GROUP_LABELS: Record<GroupBy, { columna: string; sinAsignar: string }> = {
  finca: { columna: "Finca", sinAsignar: "—" },
  ruta: { columna: "Ruta", sinAsignar: "Sin ruta" },
  itinerario: { columna: "Itinerario", sinAsignar: "Sin itinerario" },
};

function keyFor(rec: Recoleccion, groupBy: GroupBy): { key: string; nombre: string } {
  if (groupBy === "finca") {
    return { key: String(rec.finca_id), nombre: rec.finca_nombre };
  }
  if (groupBy === "ruta") {
    return {
      key: rec.ruta_id !== null ? String(rec.ruta_id) : "sin-ruta",
      nombre: rec.ruta_nombre ?? GROUP_LABELS.ruta.sinAsignar,
    };
  }
  return {
    key: rec.itinerario_id !== null ? String(rec.itinerario_id) : "sin-itinerario",
    nombre: rec.itinerario_nombre ?? GROUP_LABELS.itinerario.sinAsignar,
  };
}

interface RecoleccionesResumenProps {
  recolecciones: Recoleccion[];
}

export function RecoleccionesResumen({ recolecciones }: RecoleccionesResumenProps) {
  const [groupBy, setGroupBy] = useState<GroupBy>("finca");

  const totalLitros = useMemo(
    () => recolecciones.reduce((acc, r) => acc + r.litros, 0),
    [recolecciones]
  );
  const totalValor = useMemo(
    () => recolecciones.reduce((acc, r) => acc + r.valor_total, 0),
    [recolecciones]
  );
  const fincasConRecoleccion = useMemo(
    () => new Set(recolecciones.map((r) => r.finca_id)).size,
    [recolecciones]
  );
  const promedioPorFinca = fincasConRecoleccion > 0 ? totalLitros / fincasConRecoleccion : 0;

  const groupRows = useMemo(() => {
    const map = new Map<string, GroupRow & { fincaIds: Set<number> }>();
    recolecciones.forEach((r) => {
      const { key, nombre } = keyFor(r, groupBy);
      const entry = map.get(key) ?? {
        id: key,
        nombre,
        fincasCount: 0,
        registros: 0,
        litros: 0,
        valor: 0,
        fincaIds: new Set<number>(),
      };
      entry.registros += 1;
      entry.litros += r.litros;
      entry.valor += r.valor_total;
      entry.fincaIds.add(r.finca_id);
      map.set(key, entry);
    });
    return Array.from(map.values())
      .map((entry) => ({ ...entry, fincasCount: entry.fincaIds.size }))
      .sort((a, b) => b.litros - a.litros);
  }, [recolecciones, groupBy]);

  const columns: ColumnDef<GroupRow>[] = useMemo(() => {
    const base: ColumnDef<GroupRow>[] = [
      {
        accessorKey: "nombre",
        header: GROUP_LABELS[groupBy].columna,
      },
    ];

    if (groupBy !== "finca") {
      base.push({
        accessorKey: "fincasCount",
        header: "Fincas",
      });
    }

    base.push(
      {
        accessorKey: "registros",
        header: "Recolecciones",
      },
      {
        accessorKey: "litros",
        header: "Litros",
        cell: ({ getValue }) =>
          `${getValue<number>().toLocaleString("es-CO", { minimumFractionDigits: 1 })} L`,
      },
      {
        accessorKey: "valor",
        header: "Valor total",
        cell: ({ getValue }) =>
          `$${getValue<number>().toLocaleString("es-CO", { minimumFractionDigits: 0 })}`,
      }
    );

    return base;
  }, [groupBy]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Litros recolectados
              </p>
              <p className="text-2xl font-bold text-gray-900 mt-1.5">
                {totalLitros.toLocaleString("es-CO", { minimumFractionDigits: 1 })}{" "}
                <span className="text-base font-medium text-gray-400">L</span>
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ml-3 bg-teal-50">
              <Droplets className="h-5 w-5 text-teal-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Valor total
              </p>
              <p className="text-2xl font-bold text-teal-700 mt-1.5">
                ${totalValor.toLocaleString("es-CO", { minimumFractionDigits: 0 })}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ml-3 bg-teal-50">
              <DollarSign className="h-5 w-5 text-teal-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Fincas con recolección
              </p>
              <p className="text-2xl font-bold text-gray-900 mt-1.5">{fincasConRecoleccion}</p>
            </div>
            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ml-3 bg-teal-50">
              <Building2 className="h-5 w-5 text-teal-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Promedio por finca
              </p>
              <p className="text-2xl font-bold text-gray-900 mt-1.5">
                {promedioPorFinca.toLocaleString("es-CO", { minimumFractionDigits: 1 })}{" "}
                <span className="text-base font-medium text-gray-400">L</span>
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ml-3 bg-teal-50">
              <ListChecks className="h-5 w-5 text-teal-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-gray-500 mr-1">Agrupar por:</span>
        {(["finca", "ruta", "itinerario"] as GroupBy[]).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGroupBy(g)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize ${
              groupBy === g
                ? "bg-teal-600 text-white border-teal-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-teal-300"
            }`}
          >
            {GROUP_LABELS[g].columna}
          </button>
        ))}
      </div>

      <DataTable
        data={groupRows}
        columns={columns}
        filterPlaceholder={`Buscar ${GROUP_LABELS[groupBy].columna.toLowerCase()}...`}
      />
    </div>
  );
}
