"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  ArrowDownCircle,
  ArrowUpCircle,
  Droplets,
  Beef,
  X,
  Leaf,
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
    icon: Beef,
    allowedRoles: ["admin", "viewer"] as UserRole[],
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
};

export function Sidebar({
  role,
  mobileMenuOpen = false,
  onCloseMobileMenu,
}: SidebarProps = {}) {
  const pathname = usePathname();

  const allowedItems = navItems.filter((item) =>
    role ? item.allowedRoles.includes(role) : false
  );

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
          "fixed lg:static inset-y-0 left-0 z-50 w-64 min-h-screen bg-gray-900 flex flex-col transition-transform duration-300 ease-in-out",
          "lg:translate-x-0",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand */}
        <div className="h-16 flex items-center justify-between pl-8 pr-5 border-b border-gray-700">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-green-600 flex items-center justify-center shadow-sm ml-3">
              <Leaf className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold text-white tracking-tight ml-3">
              Finca Toca
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
        <nav className="flex-1 px-3 py-6 space-y-1">
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
