"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  TrendingDown,
  TrendingUp,
  Milk,
  PawPrint,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";

const navItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    allowedRoles: ["admin", "viewer"] as UserRole[],
  },
  {
    href: "/dashboard/gastos",
    label: "Gastos",
    icon: TrendingDown,
    allowedRoles: ["admin", "viewer"] as UserRole[],
  },
  {
    href: "/dashboard/ingresos",
    label: "Ingresos",
    icon: TrendingUp,
    allowedRoles: ["admin", "viewer"] as UserRole[],
  },
  {
    href: "/dashboard/extracciones",
    label: "Extracciones",
    icon: Milk,
    allowedRoles: ["admin", "viewer", "user"] as UserRole[],
  },
  {
    href: "/dashboard/vacas",
    label: "Vacas",
    icon: PawPrint,
    allowedRoles: ["admin", "viewer"] as UserRole[],
  },
];

interface SidebarProps {
  role?: UserRole | null;
  mobileMenuOpen?: boolean;
  onCloseMobileMenu?: () => void;
}

export function Sidebar({
  role,
  mobileMenuOpen = false,
  onCloseMobileMenu,
}: SidebarProps = {}) {
  const pathname = usePathname();

  // Filtrar items según rol del usuario
  const allowedItems = navItems.filter((item) =>
    role ? item.allowedRoles.includes(role) : false,
  );

  return (
    <>
      {/* Overlay móvil */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={onCloseMobileMenu}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-64 min-h-screen bg-gray-900 text-white flex flex-col transition-transform duration-300 ease-in-out",
          "lg:translate-x-0",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Header con botón cerrar en móvil */}
        <div className="p-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Finca Dashboard</h1>
            {role === "admin" && (
              <span className="text-xs bg-yellow-600 px-2 py-1 rounded mt-2 inline-block">
                Administrador
              </span>
            )}
            {role === "viewer" && (
              <span className="text-xs bg-blue-600 px-2 py-1 rounded mt-2 inline-block">
                Viewer
              </span>
            )}
          </div>
          <button
            onClick={onCloseMobileMenu}
            className="lg:hidden p-2 hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navegación */}
        <nav className="flex-1 px-3 py-2 space-y-1">
          {allowedItems.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === "/dashboard"
                ? pathname === href
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onCloseMobileMenu}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-gray-700 text-white"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
