import { LogOut } from "lucide-react";
import { signOut } from "@/features/auth/actions/auth.actions";
import type { Membresia } from "@/modules/core/auth/sesion";
import { TenantSwitcher } from "@/modules/core/tenants/components/tenant-switcher";

interface SinClienteActivoProps {
  email: string;
  esPlatformAdmin: boolean;
  membresias: Membresia[];
}

/**
 * Pantalla del dashboard cuando la sesión no tiene un cliente activo: el platform admin que todavía no
 * eligió uno (selector) o una cuenta sin membresía ni rol (nada que elegir; avisa y permite salir).
 */
export function SinClienteActivo({ email, esPlatformAdmin, membresias }: SinClienteActivoProps) {
  const puedeElegir = esPlatformAdmin || membresias.length > 0;

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 text-stone-900 shadow-sm space-y-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">
            {puedeElegir ? "Elige un cliente" : "Tu cuenta aún no tiene acceso"}
          </h1>
          <p className="text-sm text-stone-600">
            {puedeElegir
              ? "Selecciona el cliente con el que quieres trabajar."
              : "Todavía no tienes un cliente asignado. Pide a un administrador que te dé acceso."}
          </p>
          {email && <p className="text-xs text-stone-500 truncate">{email}</p>}
        </div>

        {puedeElegir && (
          <TenantSwitcher
            tenantActualId={null}
            tenantActualNombre={null}
            membresias={membresias.map((m) => ({
              id: m.tenantId,
              nombre: m.nombre,
              slug: m.slug,
              vertical: m.vertical,
            }))}
            esPlatformAdmin={esPlatformAdmin}
          />
        )}

        <form action={signOut}>
          <button
            type="submit"
            className="flex items-center gap-1.5 text-xs font-medium text-stone-700 hover:text-stone-900 transition-colors px-2.5 py-2 rounded-lg hover:bg-stone-200"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            Salir
          </button>
        </form>
      </div>
    </main>
  );
}
