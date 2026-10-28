import { redirect } from "next/navigation";
import { getSesionBase } from "../auth/sesion";
import { requirePlatformAdmin } from "../auth/guards";

/**
 * Para páginas y layouts de `/admin` (Server Components): manda a `/login` sin sesión y al dashboard a quien
 * no es platform admin. Usa la sesión *base*, porque un platform admin puede no tener cliente activo. Los
 * Server Actions NO usan esto sino `requirePlatformAdmin()`, que lanza `AuthorizationError`.
 */
export async function requirePlatformAdminPagina(): Promise<void> {
  const base = await getSesionBase();
  if (!base) redirect("/login");
  if (!base.esPlatformAdmin) redirect("/dashboard");
  await requirePlatformAdmin();
}
