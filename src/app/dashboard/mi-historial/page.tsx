import { checkRoutePermission } from "@/lib/auth/check-permissions";
import { MiHistorialView } from "@/features/mi-historial/components/mi-historial-view";

export default async function MiHistorialPage() {
  await checkRoutePermission(["cooperativa_user"]);
  return <MiHistorialView />;
}
