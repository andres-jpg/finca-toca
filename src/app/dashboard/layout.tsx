import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-user-role";
import { canWrite } from "@/lib/auth/check-permissions";
import { DashboardLayoutClient } from "@/components/layout/dashboard-layout-client";
import { SinClienteActivo } from "@/components/layout/sin-cliente-activo";
import { getAlertas } from "@/features/alertas/actions/alertas.queries";
import { AlertasBell } from "@/features/alertas/components/alertas-bell";
import { registrarContextoSentry } from "@/lib/sentry/contexto";
import { ContextoSentryCliente } from "@/components/sentry/contexto-sentry-cliente";
import { getSesionBase } from "@/modules/core/auth/sesion";
import { getNavParaSesion } from "@/modules/registry";
import type { UserRole } from "@/types";

/** El hato solo existe para la finca: los roles de cooperativa no pagan la consulta. */
const ROLES_CON_ALERTAS: UserRole[] = ["admin", "user", "viewer"];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Un único punto de lectura de sesión (usuario + RPC mi_sesion(): 2 round-trips). La sesión "base"
  // admite no tener cliente activo, para poder mostrar el selector al platform admin que aún no eligió.
  const sesion = await getSesionBase();

  if (!sesion) {
    // Sin usuario → login. Con usuario pero sin lectura de sesión (fallo de la RPC) no se redirige a
    // /login: el proxy devolvería al usuario autenticado a /dashboard y entraría en bucle.
    if (!(await getCurrentUser())) redirect("/login");
    return <SinClienteActivo email="" esPlatformAdmin={false} membresias={[]} />;
  }

  // Tags tenant/rol y user.id (sin email) para que los errores de Sentry digan qué cliente los sufre.
  await registrarContextoSentry();

  const { tenant, rolLegacy, esPlatformAdmin, membresias } = sesion;

  if (!tenant) {
    return (
      <SinClienteActivo
        email={sesion.user.email}
        esPlatformAdmin={esPlatformAdmin}
        membresias={membresias}
      />
    );
  }

  // getAlertas() está envuelto en React.cache(): el dashboard reutiliza esta misma lectura.
  const alertasSlot =
    rolLegacy && ROLES_CON_ALERTAS.includes(rolLegacy) ? (
      <AlertasBell alertas={await getAlertas()} canEdit={canWrite(rolLegacy)} />
    ) : undefined;

  // Los clientes ganaderos y de cooperativa siguen gobernados por `roles` (políticas legacy con
  // rol_actual()). Un platform admin sin fila en `roles` entra, pero no ve datos: se le avisa.
  const soporteLimitado = esPlatformAdmin && rolLegacy === null && tenant.vertical !== "cafe";

  // El menú se arma aquí, en el servidor: manifiestos de los módulos activos del cliente, filtrados por su
  // vertical y su rol. Al cliente solo viajan las entradas (datos); el PWA lo resuelve la barra lateral.
  const navItems = getNavParaSesion({ tenant, rolTenant: sesion.rolTenant, rolLegacy });

  return (
    <>
      {/* Mismo contexto de Sentry, pero para los errores que ocurren en el navegador. */}
      <ContextoSentryCliente
        userId={sesion.user.id}
        rol={rolLegacy}
        tenantSlug={tenant.slug}
        vertical={tenant.vertical}
      />
      <DashboardLayoutClient
        email={sesion.user.email}
        userRole={rolLegacy}
        tenantId={tenant.id}
        tenantNombre={tenant.nombre}
        tenantLogoUrl={tenant.logoUrl}
        vertical={tenant.vertical}
        navItems={navItems}
        membresias={membresias}
        esPlatformAdmin={esPlatformAdmin}
        soporteLimitado={soporteLimitado}
        alertasSlot={alertasSlot}
      >
        {children}
      </DashboardLayoutClient>
    </>
  );
}
