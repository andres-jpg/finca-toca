"use client";
import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  ArrowDownCircle,
  ArrowUpCircle,
  Droplets,
  X,
  Leaf,
  Settings,
  Building2,
  MapPin,
  ClipboardList,
  Package,
  FileSpreadsheet,
  Users,
  Route,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";
import { GiBull, GiCheeseWedge } from "react-icons/gi";
import { PiCow } from "react-icons/pi";

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  allowedRoles: UserRole[];
  hideInPWA?: boolean;
};

const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    allowedRoles: ["admin", "viewer"] as UserRole[],
  },
  {
    href: "/dashboard/gastos",
    label: "Gastos",
    icon: ArrowDownCircle,
    allowedRoles: ["admin", "viewer"] as UserRole[],
  },
  {
    href: "/dashboard/ingresos",
    label: "Ingresos",
    icon: ArrowUpCircle,
    allowedRoles: ["admin", "viewer"] as UserRole[],
  },
  {
    href: "/dashboard/extracciones",
    label: "Extracciones",
    icon: Droplets,
    allowedRoles: ["admin", "viewer", "user"] as UserRole[],
  },
  {
    href: "/dashboard/vacas",
    label: "Vacas",
    icon: PiCow,
    allowedRoles: ["admin", "viewer"] as UserRole[],
  },
  {
    href: "/dashboard/toros",
    label: "Toros",
    icon: GiBull,
    allowedRoles: ["admin", "viewer"] as UserRole[],
  },
  {
    href: "/dashboard/inventario",
    label: "Inventario",
    icon: Package,
    allowedRoles: ["admin", "viewer"] as UserRole[],
  },
  {
    href: "/dashboard/configuracion",
    label: "Configuración",
    icon: Settings,
    allowedRoles: ["admin"] as UserRole[],
  },
  {
    href: "/dashboard/cooperativa",
    label: "Dashboard Coop.",
    icon: LayoutDashboard,
    allowedRoles: ["cooperativa_admin"] as UserRole[],
  },
  {
    href: "/dashboard/fincas-cooperativa",
    label: "Fincas",
    icon: Building2,
    allowedRoles: ["cooperativa_admin"] as UserRole[],
  },
  {
    href: "/dashboard/rutas-cooperativa",
    label: "Rutas",
    icon: MapPin,
    allowedRoles: ["cooperativa_admin"] as UserRole[],
  },
  {
    href: "/dashboard/itinerarios",
    label: "Itinerarios",
    icon: Route,
    allowedRoles: ["cooperativa_admin", "cooperativa_user"] as UserRole[],
    hideInPWA: true,
  },
  {
    href: "/dashboard/recolecciones",
    label: "Recolecciones",
    icon: ClipboardList,
    allowedRoles: ["cooperativa_admin", "cooperativa_user"] as UserRole[],
  },
  {
    href: "/dashboard/informes-cooperativa",
    label: "Informes",
    icon: FileSpreadsheet,
    allowedRoles: ["cooperativa_admin"] as UserRole[],
  },
  {
    href: "/dashboard/usuarios-cooperativa",
    label: "Usuarios",
    icon: Users,
    allowedRoles: ["cooperativa_admin"] as UserRole[],
  },
];

interface SidebarProps {
  role?: UserRole | null;
  mobileMenuOpen?: boolean;
  onCloseMobileMenu?: () => void;
}

const roleConfig: Record<UserRole, { label: string; classes: string }> = {
  admin: { label: "Administrador", classes: "bg-yellow-500/20 text-yellow-300" },
  viewer: { label: "Solo lectura", classes: "bg-gray-700 text-gray-300" },
  user: { label: "Usuario", classes: "bg-blue-500/20 text-blue-300" },
  cooperativa_admin: { label: "Coop. Admin", classes: "bg-teal-500/20 text-teal-300" },
  cooperativa_user: { label: "Coop. Usuario", classes: "bg-cyan-500/20 text-cyan-300" },
};

export function Sidebar({
  role,
  mobileMenuOpen = false,
  onCloseMobileMenu,
}: SidebarProps = {}) {
  const pathname = usePathname();
  const [isPWA, setIsPWA] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true);
    setIsPWA(standalone);
  }, []);

  const allowedItems = navItems.filter((item) => {
    if (!role || !item.allowedRoles.includes(role)) return false;
    if (isPWA && item.hideInPWA && role === "cooperativa_user") return false;
    return true;
  });

  const roleMeta = role ? roleConfig[role] : null;

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
            {role === "cooperativa_admin" || role === "cooperativa_user" ? (
              <>
                <div className="h-8 w-8 rounded-lg bg-teal-600 flex items-center justify-center shadow-sm shrink-0">
                  <GiCheeseWedge className="h-4 w-4 text-white" />
                </div>
                <span className="font-semibold text-white tracking-tight truncate">
                  Toca Lácteos
                </span>
              </>
            ) : (
              <>
                <div className="h-8 w-8 rounded-lg bg-green-600 flex items-center justify-center shadow-sm shrink-0">
                  <Leaf className="h-4 w-4 text-white" />
                </div>
                <span className="font-semibold text-white tracking-tight truncate">
                  Finca Villa Blanca
                </span>
              </>
            )}
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
