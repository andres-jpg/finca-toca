"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, TrendingDown, TrendingUp, Milk } from "lucide-react";
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
];

interface SidebarProps {
  role?: UserRole | null;
}

export function Sidebar({ role }: SidebarProps = {}) {
  const pathname = usePathname();

  console.log("🔑 Sidebar - Rol recibido:", role);

  // Filtrar items según rol del usuario
  const allowedItems = navItems.filter((item) =>
    role ? item.allowedRoles.includes(role) : false,
  );

  return (
    <aside className="w-64 min-h-screen bg-gray-900 text-white flex flex-col">
      <div className="p-6">
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
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-gray-700 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white",
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
