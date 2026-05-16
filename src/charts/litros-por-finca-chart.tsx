"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface FincaLitros {
  finca: string;
  litros: number;
  rutas: string[];
}

interface RutaOption {
  id: number;
  nombre: string;
}

interface LitrosPorFincaChartProps {
  data: FincaLitros[];
  rutas: RutaOption[];
}

export function LitrosPorFincaChart({ data, rutas }: LitrosPorFincaChartProps) {
  const [selectedRuta, setSelectedRuta] = useState<string>("General");

  const filtered =
    selectedRuta === "General"
      ? data
      : data.filter((d) => d.rutas.includes(selectedRuta));

  const sorted = [...filtered].sort((a, b) => b.litros - a.litros).slice(0, 5);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-semibold text-gray-700">
          Top 5 fincas por litros
        </CardTitle>
        <select
          value={selectedRuta}
          onChange={(e) => setSelectedRuta(e.target.value)}
          className="text-xs border border-stone-200 rounded-md px-2 py-1 bg-white text-stone-600 focus:outline-none focus:ring-1 focus:ring-teal-500"
        >
          <option value="General">General</option>
          {rutas.map((r) => (
            <option key={r.id} value={r.nombre}>
              {r.nombre}
            </option>
          ))}
        </select>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-sm text-gray-400">
            Sin datos
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={sorted}
              layout="vertical"
              margin={{ top: 4, right: 40, left: 8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickFormatter={(v) => `${v}L`}
              />
              <YAxis
                type="category"
                dataKey="finca"
                width={110}
                tick={{ fontSize: 11, fill: "#374151" }}
              />
              <Tooltip
                formatter={(value) => [
                  `${Number(value).toLocaleString("es-CO", { minimumFractionDigits: 1 })} L`,
                  "Litros",
                ]}
              />
              <Bar dataKey="litros" fill="#14b8a6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
