import { checkRoutePermission } from "@/lib/auth/check-permissions";
import { getCooperativaUsers } from "@/features/usuarios-cooperativa/actions/usuarios.actions";
import { getItinerarios } from "@/features/itinerarios/actions/itinerarios.actions";
import { UsuariosCooperativaTable } from "@/features/usuarios-cooperativa/components/usuarios-cooperativa-table";

export default async function UsuariosCooperativaPage() {
  await checkRoutePermission(["cooperativa_admin"]);

  const [users, itinerarios] = await Promise.all([
    getCooperativaUsers(),
    getItinerarios(),
  ]);

  return <UsuariosCooperativaTable users={users} itinerarios={itinerarios} />;
}
