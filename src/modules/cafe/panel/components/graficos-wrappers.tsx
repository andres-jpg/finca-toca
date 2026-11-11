"use client";

import dynamic from "next/dynamic";

// Recharts no se renderiza en el servidor: `next/dynamic` con `ssr: false` solo se permite en un módulo de cliente (mismo
// patrón que `charts/chart-wrappers.tsx`). La página importa estos ya envueltos.

const Cargando = () => <div className="h-80 animate-pulse rounded-xl border border-stone-200 bg-white" />;

export const GraficoIngreso = dynamic(() => import("./grafico-ingreso").then((m) => m.GraficoIngreso), { ssr: false, loading: Cargando });
