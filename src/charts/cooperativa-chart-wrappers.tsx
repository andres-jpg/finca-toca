"use client";

import dynamic from "next/dynamic";

export const RecoleccionesTrendChart = dynamic(
  () => import("@/charts/recolecciones-trend-chart").then((m) => m.RecoleccionesTrendChart),
  { ssr: false }
);

export const LitrosPorRutaChart = dynamic(
  () => import("@/charts/litros-por-ruta-chart").then((m) => m.LitrosPorRutaChart),
  { ssr: false }
);

export const LitrosPorFincaChart = dynamic(
  () => import("@/charts/litros-por-finca-chart").then((m) => m.LitrosPorFincaChart),
  { ssr: false }
);

export const GastosCooperativaChart = dynamic(
  () => import("@/charts/gastos-cooperativa-chart").then((m) => m.GastosCooperativaChart),
  { ssr: false }
);

export const LitrosPorDiaSerieChart = dynamic(
  () => import("@/charts/litros-por-dia-serie-chart").then((m) => m.LitrosPorDiaSerieChart),
  { ssr: false }
);
