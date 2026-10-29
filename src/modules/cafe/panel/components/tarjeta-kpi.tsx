import { cn } from "@/lib/utils";
import { InfoDefinicion } from "./info-definicion";

interface TarjetaKpiProps {
  titulo: string;
  /** El texto del tooltip: la definición del indicador (ver `DEFINICIONES`). */
  definicion: string;
  /** Resalta la tarjeta (p. ej. desvíos o insumos bajo mínimo con valores > 0). */
  destacar?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** Marco común de las tarjetas del panel: título, el botón con la definición y el contenido. Presentacional. */
export function TarjetaKpi({ titulo, definicion, destacar, className, children }: TarjetaKpiProps) {
  return (
    <section className={cn("flex flex-col gap-2 rounded-lg border bg-white p-3 sm:p-4", destacar ? "border-amber-300" : "border-stone-200", className)}>
      <header className="flex items-start justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">{titulo}</h3>
        <InfoDefinicion titulo={titulo} texto={definicion} />
      </header>
      {children}
    </section>
  );
}

/** Texto de apoyo bajo la cifra principal. */
export function Detalle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-xs text-gray-500", className)}>{children}</p>;
}

/** La cifra principal de una tarjeta. */
export function Cifra({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-2xl font-semibold tabular-nums text-gray-900", className)}>{children}</p>;
}
