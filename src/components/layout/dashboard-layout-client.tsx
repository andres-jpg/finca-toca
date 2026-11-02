"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { BarraInferior } from "@/components/layout/barra-inferior";
import { Header } from "@/components/layout/header";
import { TenantSwitcher } from "@/modules/core/tenants/components/tenant-switcher";
import type { Membresia } from "@/modules/core/auth/sesion";
import type { NavItemDef } from "@/modules/core/registry/types";
import type { Vertical } from "@/modules/core/tenants/tenant.queries";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";

interface DashboardLayoutClientProps {
  email: string;
  userRole: UserRole | null;
  tenantId: string;
  /** Nombre del cliente activo para la marca de la barra lateral y el selector. */
  tenantNombre: string;
  tenantLogoUrl: string | null;
  vertical: Vertical;
  /** Entradas del menú, ya filtradas en el servidor por vertical, módulos y rol (`getNavParaSesion()`). */
  navItems: NavItemDef[];
  /** Con más de una (o siendo platform admin) aparece el selector de cliente en el header. */
  membresias: Membresia[];
  esPlatformAdmin: boolean;
  /** Platform admin en un cliente legacy sin fila en `roles`: las pantallas salen vacías por RLS. */
  soporteLimitado: boolean;
  /** Se reenvía tal cual al Header: se renderiza en el servidor pese a este boundary. */
  alertasSlot?: React.ReactNode;
  children: React.ReactNode;
}

/** Verticales con menú fijo: sin menú plegable; en pantallas menores a `lg`, barra inferior con las opciones del rol. */
const VERTICALES_CON_BARRA_INFERIOR: readonly Vertical[] = ["cafe"];

export function DashboardLayoutClient({
  email,
  userRole,
  tenantId,
  tenantNombre,
  tenantLogoUrl,
  vertical,
  navItems,
  membresias,
  esPlatformAdmin,
  soporteLimitado,
  alertasSlot,
  children,
}: DashboardLayoutClientProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const menuFijo = VERTICALES_CON_BARRA_INFERIOR.includes(vertical);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <div
        className={cn(
          "shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out",
          desktopCollapsed && !menuFijo ? "w-0" : "w-0 lg:w-52"
        )}
      >
        <Sidebar
          role={userRole}
          tenantNombre={tenantNombre}
          tenantLogoUrl={tenantLogoUrl}
          vertical={vertical}
          items={navItems}
          mobileMenuOpen={mobileMenuOpen}
          onCloseMobileMenu={() => setMobileMenuOpen(false)}
        />
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          email={email}
          tenantSwitcher={
            membresias.length > 1 || esPlatformAdmin ? (
              <TenantSwitcher
                tenantActualId={tenantId}
                tenantActualNombre={tenantNombre}
                membresias={membresias.map((m) => ({
                  id: m.tenantId,
                  nombre: m.nombre,
                  slug: m.slug,
                  vertical: m.vertical,
                }))}
                esPlatformAdmin={esPlatformAdmin}
              />
            ) : undefined
          }
          alertasSlot={alertasSlot}
          menuFijo={menuFijo}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onToggleDesktopSidebar={() => setDesktopCollapsed((prev) => !prev)}
        />
        <main className={cn("flex-1 p-4 sm:p-6 lg:p-8", menuFijo && "pb-24 lg:pb-8")}>
          {soporteLimitado && (
            <div
              role="status"
              className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                <strong className="font-semibold">Vista de soporte limitada en módulos legacy.</strong>{" "}
                Este cliente usa permisos antiguos y tu cuenta de plataforma no tiene un rol en él, así que
                las pantallas pueden aparecer vacías.
              </p>
            </div>
          )}
          {children}
        </main>
      </div>
      {menuFijo && <BarraInferior items={navItems} role={userRole} />}
    </div>
  );
}
