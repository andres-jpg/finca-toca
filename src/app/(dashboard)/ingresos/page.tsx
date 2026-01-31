import { getIngresos } from "@/features/ingresos/actions/ingresos.actions";
import { IngresosTable } from "@/features/ingresos/components/ingresos-table";

export default async function IngresosPage() {
  const ingresos = await getIngresos();

  return (
    <div className="max-w-5xl mx-auto">
      <IngresosTable ingresos={ingresos} />
    </div>
  );
}
