"use client";

import dynamic from "next/dynamic";

export const ConceptosDonutChart = dynamic(
  () => import("@/charts/conceptos-donut-chart").then((m) => m.ConceptosDonutChart),
  { ssr: false }
);

export const GastosIngresosLineChart = dynamic(
  () => import("@/charts/gastos-ingresos-line-chart").then((m) => m.GastosIngresosLineChart),
  { ssr: false }
);

export const ExtraccionesLineChart = dynamic(
  () => import("@/charts/extracciones-line-chart").then((m) => m.ExtraccionesLineChart),
  { ssr: false }
);
