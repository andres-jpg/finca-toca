import { getIngresos, getConceptosIngreso } from "@/features/ingresos/actions/ingresos.actions";
import { IngresosTable } from "@/features/ingresos/components/ingresos-table";
import { checkRoutePermission, canWrite } from "@/lib/auth/check-permissions";
import { getAnimalesDeAlta } from "@/features/animales/actions/animales.actions";

export default async function IngresosPage() {
  const [userRole, ingresos, conceptos, animalesDeAlta] = await Promise.all([
    checkRoutePermission(["admin", "viewer"]),
    getIngresos(),
    getConceptosIngreso(),
    getAnimalesDeAlta(),
  ]);
  const canEdit = canWrite(userRole);
  const vacas = animalesDeAlta.filter((a) => a.sexo === "hembra");
  const toros = animalesDeAlta.filter((a) => a.sexo === "macho");

  return <IngresosTable ingresos={ingresos} conceptos={conceptos} vacas={vacas} toros={toros} canEdit={canEdit} />;
}
