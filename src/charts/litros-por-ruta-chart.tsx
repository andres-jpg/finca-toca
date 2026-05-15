"use client";

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

interface RutaLitros {
  ruta: string;
  litros: number;
}

interface LitrosPorRutaChartProps {
  data: RutaLitros[];
}

export function LitrosPorRutaChart({ data }: LitrosPorRutaChartProps) {
  const sorted = [...data].sort((a, b) => b.litros - a.litros);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-gray-700">
          Litros por ruta
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-sm text-gray-400">
            Sin datos
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={sorted} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="ruta"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                interval={0}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickFormatter={(v) => `${v}L`}
              />
              <Tooltip
                formatter={(value) => [
                  `${Number(value).toLocaleString("es-CO", { minimumFractionDigits: 1 })} L`,
                  "Litros",
                ]}
              />
              <Bar dataKey="litros" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
