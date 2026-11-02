"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Barra de pestañas de Configuración. Cada destino mide ≥ 44 px y se desliza si no cabe; sin hover. */
export function ConfiguracionTabsNav({ pestanas }: { pestanas: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Configuración" className="mb-6 border-b border-stone-200">
      <h1 className="mb-2 text-xl font-semibold text-stone-900">Configuración</h1>
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {pestanas.map(({ href, label }) => {
          const activa = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={activa ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center border-b-2 px-4 text-sm font-medium",
                  activa ? "border-amber-700 text-amber-800" : "border-transparent text-stone-600"
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
