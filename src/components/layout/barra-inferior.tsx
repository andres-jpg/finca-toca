"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ocultoEnPWA } from "@/modules/core/registry/nav";
import type { NavItemDef } from "@/modules/core/registry/types";
import type { UserRole } from "@/types";
import { ICONOS } from "./icon-map";
import { hrefActivoDe } from "./sidebar";

function suscribirPWA(onChange: () => void) {
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const esPWA = () => window.matchMedia("(display-mode: standalone)").matches;

/**
 * Barra inferior fija para tablet (y móvil): las mismas opciones del rol que la barra lateral, que a partir de
 * `lg` ocupa su lugar. Pensada para el uso con dedo: cada destino mide al menos 44 px de alto y ancho, el estado
 * activo se ve sin hover, y si no caben todas se desliza en horizontal en vez de encogerlas.
 */
export function BarraInferior({ items, role }: { items: NavItemDef[]; role: UserRole | null }) {
  const pathname = usePathname();
  const isPWA = useSyncExternalStore(suscribirPWA, esPWA, () => false);
  const visibles = items.filter((item) => !ocultoEnPWA(item, role, isPWA));
  const activo = hrefActivoDe(visibles, pathname);

  return (
    <nav
      aria-label="Menú principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="flex overflow-x-auto">
        {visibles.map(({ href, label, icon, numero }) => {
          const Icon = ICONOS[icon];
          const esActivo = href === activo;
          return (
            <li key={href} className="min-w-[4.5rem] flex-1">
              <Link
                href={href}
                aria-current={esActivo ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 px-2 py-1.5 text-center text-[11px] font-medium leading-tight",
                  esActivo ? "bg-amber-50 text-amber-800" : "text-stone-600 active:bg-stone-100"
                )}
              >
                {numero ? (
                  <span
                    aria-hidden
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-semibold",
                      esActivo ? "border-amber-700 bg-amber-700 text-white" : "border-stone-400"
                    )}
                  >
                    {numero}
                  </span>
                ) : (
                  <Icon className="h-5 w-5" aria-hidden />
                )}
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
