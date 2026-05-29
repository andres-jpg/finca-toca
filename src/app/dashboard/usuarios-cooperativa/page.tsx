import { checkRoutePermission } from "@/lib/auth/check-permissions";
import { getCooperativaUsers } from "@/features/usuarios-cooperativa/actions/usuarios.actions";
import { getRutas } from "@/features/rutas-cooperativa/actions/rutas.actions";
import { UsuariosCooperativaTable } from "@/features/usuarios-cooperativa/components/usuarios-cooperativa-table";

export default async function UsuariosCooperativaPage() {
  await checkRoutePermission(["cooperativa_admin"]);

  const [users, rutas] = await Promise.all([
    getCooperativaUsers(),
    getRutas(),
  ]);

  return <UsuariosCooperativaTable users={users} rutas={rutas} />;
}
