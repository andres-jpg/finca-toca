import { redirect } from "next/navigation";
import { requireSesion } from "@/modules/core/auth/guards";

/**
 * Todo `/dashboard/cafe/*` es del vertical de café: quien no es de un cliente de café (ganadería,
 * cooperativa) acaba en su dashboard aunque teclee la URL a mano. Es la primera barrera; cada página
 * repite la de su módulo con `requireModuloPagina()` y cada Server Action con `requireModulo()`.
 */
export default async function CafeLayout({ children }: { children: React.ReactNode }) {
  const { tenant } = await requireSesion();
  if (tenant.vertical !== "cafe") redirect("/dashboard");
  return <>{children}</>;
}
