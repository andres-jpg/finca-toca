"use client";
import React, { Fragment, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Leaf, Coffee, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ocultoEnPWA } from "@/modules/core/registry/nav";
import type { NavItemDef } from "@/modules/core/registry/types";
import type { Vertical } from "@/modules/core/tenants/tenant.queries";
import type { UserRole } from "@/types";
import { GiCheeseWedge } from "react-icons/gi";
import { ICONOS } from "./icon-map";

interface SidebarProps {
  role?: UserRole | null;
  /** Nombre del cliente activo: es la marca de la cabecera. */
  tenantNombre?: string | null;
  /** Logo del cliente; sin él se usa el icono de su vertical. */
  tenantLogoUrl?: string | null;
  vertical?: Vertical | null;
  /**
   * Entradas del menú ya filtradas en el servidor por vertical, módulos activos y rol
   * (`getNavParaSesion()`). Este componente solo las pinta; lo único que decide aquí es lo que el
   * servidor no sabe: si la app corre instalada (PWA).
   */
  items?: NavItemDef[];
  mobileMenuOpen?: boolean;
  onCloseMobileMenu?: () => void;
}

const MARCA_VERTICAL: Record<
  Vertical,
  (nombre: string | null) => { texto: string; fondo: string; Icono: React.ElementType }
> = {
  ganaderia: (nombre) => ({ texto: nombre ? `Finca ${nombre}` : "Finca", fondo: "bg-green-600", Icono: Leaf }),
  cooperativa: (nombre) => ({ texto: nombre ?? "Toca Lácteos", fondo: "bg-teal-600", Icono: GiCheeseWedge }),
  cafe: (nombre) => ({ texto: nombre ?? "Café", fondo: "bg-amber-700", Icono: Coffee }),
};

const roleConfig: Record<UserRole, { label: string; classes: string }> = {
  admin: { label: "Administrador", classes: "bg-yellow-500/20 text-yellow-300" },
  viewer: { label: "Solo lectura", classes: "bg-gray-700 text-gray-300" },
  user: { label: "Usuario", classes: "bg-blue-500/20 text-blue-300" },
  cooperativa_admin: { label: "Coop. Admin", classes: "bg-teal-500/20 text-teal-300" },
  cooperativa_user: { label: "Coop. Usuario", classes: "bg-cyan-500/20 text-cyan-300" },
};

// ¿La app corre instalada (modo standalone)? Se lee del navegador, así que va con
// useSyncExternalStore: en el servidor es `false` y en el cliente se corrige tras hidratar.
function suscribirPWA(onChange: () => void) {
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function esPWA() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true)
  );
}

export function Sidebar({
  role,
  tenantNombre = null,
  tenantLogoUrl = null,
  vertical = null,
  items = [],
  mobileMenuOpen = false,
  onCloseMobileMenu,
}: SidebarProps = {}) {
  const pathname = usePathname();
  const isPWA = useSyncExternalStore(suscribirPWA, esPWA, () => false);

  const allowedItems = items.filter((item) => !ocultoEnPWA(item, role ?? null, isPWA));

  // Entrada resaltada: la de ruta más larga que contiene a la actual. Así «Panel» (`/dashboard/cafe`) no se
  // marca junto a «Lotes» (`/dashboard/cafe/lotes`), y `/dashboard` solo se marca en su propia página.
  const hrefActivo = allowedItems
    .map((item) => item.href)
    .filter((href) => (href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)))
    .sort((a, b) => b.length - a.length)[0];

  const roleMeta = role ? roleConfig[role] : null;

  // Marca del cliente activo. Un cliente ganadero se muestra como "Finca <nombre>" (como siempre); la
  // cooperativa y el café, con su nombre a secas. El vertical manda; sin él (sesión sin cliente) el rol.
  const verticalMarca: Vertical =
    vertical ?? (role === "cooperativa_admin" || role === "cooperativa_user" ? "cooperativa" : "ganaderia");
  const marca = MARCA_VERTICAL[verticalMarca](tenantNombre);

  return (
    <>
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
          onClick={onCloseMobileMenu}
        />
      )}

      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-52 h-full bg-gray-900 flex flex-col overflow-hidden transition-transform duration-300 ease-in-out",
          "lg:translate-x-0",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-700">
          <div className="flex items-center gap-2.5">
            {tenantLogoUrl ? (
              // Logo del cliente (URL libre configurada en `tenants.logo_url`): <img> y no next/image,
              // porque el dominio no se conoce de antemano.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tenantLogoUrl} alt="" className="h-8 w-8 rounded-lg object-cover shrink-0" />
            ) : (
              <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shadow-sm shrink-0", marca.fondo)}>
                <marca.Icono className="h-4 w-4 text-white" />
              </div>
            )}
            <span className="font-semibold text-white tracking-tight truncate" title={tenantNombre ?? undefined}>
              {marca.texto}
            </span>
          </div>
          <button
            onClick={onCloseMobileMenu}
            className="lg:hidden p-1.5 hover:bg-gray-800 rounded-md transition-colors text-gray-400"
            aria-label="Cerrar menú"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {allowedItems.map(({ href, label, icon, grupo }, i) => {
            const Icon = ICONOS[icon];
            const isActive = href === hrefActivo;
            // Encabezado del grupo cuando cambia respecto a la entrada anterior (las sin grupo no llevan).
            const encabezado = grupo && grupo !== allowedItems[i - 1]?.grupo ? grupo : null;
            return (
              <Fragment key={href}>
                {encabezado && (
                  <p className="px-4 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    {encabezado}
                  </p>
                )}
                <Link
                  href={href}
                  onClick={onCloseMobileMenu}
                  className={cn(
                    "group relative flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-150",
                    isActive
                      ? "bg-gray-700 text-white"
                      : "text-gray-400 hover:bg-gray-800 hover:text-white"
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 bg-green-400 rounded-r-full" />
                  )}
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors",
                      isActive
                        ? "text-white"
                        : "text-gray-400 group-hover:text-white"
                    )}
                  />
                  {label}
                </Link>
              </Fragment>
            );
          })}
        </nav>

        {/* Role badge */}
        {roleMeta && (
          <div className="px-4 py-4 border-t border-gray-700">
            <span
              className={cn(
                "inline-block text-xs font-medium px-2.5 py-1 rounded-md",
                roleMeta.classes
              )}
            >
              {roleMeta.label}
            </span>
          </div>
        )}
      </aside>
    </>
  );
}
