import { notFound } from "next/navigation";
import { getAnimalById, getAnimalesDeAlta } from "@/features/animales/actions/animales.actions";
import { getEventosAnimal } from "@/features/eventos-animal/actions/eventos.actions";
import { getLotesPajillas } from "@/features/inventario/pajillas/actions/pajillas.actions";
import { getAlertasAnimal } from "@/features/alertas/actions/alertas.queries";
import { getMedicionesLeche } from "@/features/mediciones-leche/actions/mediciones-leche.actions";
import { AnimalFicha } from "@/features/animales/components/animal-ficha";
import {
  calcularDiasEnLeche,
  calcularDiasEnLecheEnFecha,
  formatEdad,
} from "@/lib/animales/estados";
import { canDelete, canWrite, checkRoutePermission } from "@/lib/auth/check-permissions";
import { getTenantActual } from "@/lib/auth/get-tenant";
import type { MedicionLecheAnimal } from "@/types";

export default async function AnimalFichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [userRole, animal, animales, lotesPajillas, tenant] = await Promise.all([
    checkRoutePermission(["admin", "viewer"]),
    getAnimalById(id),
    getAnimalesDeAlta(),
    getLotesPajillas(),
    getTenantActual(),
  ]);
  const esVelero = tenant?.slug === "el-velero";

  if (!animal) notFound();

  // getEventosAnimal necesita el sexo, así que va en una segunda tanda; las alertas y las
  // mediciones de leche se piden en paralelo (mediciones solo aplica a hembras — a un macho
  // no se le ordeña).
  const [eventos, { alertas, faltaServicio }, medicionesRows] = await Promise.all([
    getEventosAnimal(id, animal.sexo === "hembra" ? "vaca" : "toro"),
    getAlertasAnimal(id),
    animal.sexo === "hembra" ? getMedicionesLeche(id) : Promise.resolve([]),
  ]);
  const canEdit = canWrite(userRole);

  // Los días en leche de cada medición se calculan aquí, en el servidor, por la misma razón
  // que la edad y el DEL de hoy: `parseFechaDB` resuelve en la zona local y en Vercel es UTC
  // frente al UTC-5 del navegador.
  const mediciones: MedicionLecheAnimal[] = medicionesRows.map((m) => ({
    ...m,
    dias_en_leche: calcularDiasEnLecheEnFecha(eventos, m.fecha),
  }));

  return (
    <AnimalFicha
      animal={animal}
      eventos={eventos}
      animales={animales}
      lotesPajillas={lotesPajillas}
      alertas={alertas}
      faltaServicio={faltaServicio}
      mediciones={mediciones}
      edad={formatEdad(animal.fecha_nacimiento)}
      // Se calcula aquí, en el servidor, por la misma razón que la edad: `parseFechaDB`
      // resuelve en la zona local y en Vercel es UTC frente al UTC-5 del navegador.
      diasEnLeche={calcularDiasEnLeche(animal.estado_productivo, eventos)}
      canEdit={canEdit}
      canDelete={canDelete(userRole)}
      esVelero={esVelero}
    />
  );
}
