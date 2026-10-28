import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getUserRole } from "@/lib/auth/get-user-role";
import { getTenantActual } from "@/modules/core/tenants/tenant.queries";
import { canWrite } from "@/lib/auth/check-permissions";
import { DashboardLayoutClient } from "@/components/layout/dashboard-layout-client";
import { getAlertas } from "@/features/alertas/actions/alertas.queries";
import { AlertasBell } from "@/features/alertas/components/alertas-bell";
import { registrarContextoSentry } from "@/lib/sentry/contexto";
import { ContextoSentryCliente } from "@/components/sentry/contexto-sentry-cliente";
import type { UserRole } from "@/types";

/** El hato solo existe para la finca: los roles de cooperativa no pagan la consulta. */
const ROLES_CON_ALERTAS: UserRole[] = ["admin", "user", "viewer"];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const [
    {
      data: { session },
    },
    userRole,
    tenant,
  ] = await Promise.all([supabase.auth.getSession(), getUserRole(), getTenantActual()]);

  if (!session) {
    redirect("/login");
  }

  // Tags tenant/rol y user.id (sin email) para que los errores de Sentry digan qué cliente los sufre.
  await registrarContextoSentry();

  // getAlertas() está envuelto en React.cache(): el dashboard reutiliza esta misma lectura.
  const alertasSlot =
    userRole && ROLES_CON_ALERTAS.includes(userRole) ? (
      <AlertasBell alertas={await getAlertas()} canEdit={canWrite(userRole)} />
    ) : undefined;

  return (
    <>
      {/* Mismo contexto de Sentry, pero para los errores que ocurren en el navegador. */}
      <ContextoSentryCliente
        userId={session.user.id}
        rol={userRole}
        tenantSlug={tenant?.slug ?? null}
        vertical={tenant?.vertical ?? null}
      />
      <DashboardLayoutClient
        email={session.user.email ?? ""}
        userRole={userRole}
        tenantNombre={tenant?.nombre ?? null}
        modulos={tenant?.modulos ?? []}
        alertasSlot={alertasSlot}
      >
        {children}
      </DashboardLayoutClient>
    </>
  );
}
