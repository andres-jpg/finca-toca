"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";

interface DashboardLayoutClientProps {
  email: string;
  userRole: UserRole | null;
  /** Nombre del cliente para la marca de la barra lateral; `null` en roles de cooperativa. */
  tenantNombre: string | null;
  /** Slug del cliente: decide qué módulos opcionales aparecen en el menú. */
  tenantSlug: string | null;
  /** Se reenvía tal cual al Header: se renderiza en el servidor pese a este boundary. */
  alertasSlot?: React.ReactNode;
  children: React.ReactNode;
}

export function DashboardLayoutClient({
  email,
  userRole,
  tenantNombre,
  tenantSlug,
  alertasSlot,
  children,
}: DashboardLayoutClientProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <div
        className={cn(
          "shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out",
          desktopCollapsed ? "w-0" : "w-0 lg:w-52"
        )}
      >
        <Sidebar
          role={userRole}
          tenantNombre={tenantNombre}
          tenantSlug={tenantSlug}
          mobileMenuOpen={mobileMenuOpen}
          onCloseMobileMenu={() => setMobileMenuOpen(false)}
        />
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          email={email}
          alertasSlot={alertasSlot}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onToggleDesktopSidebar={() => setDesktopCollapsed((prev) => !prev)}
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
