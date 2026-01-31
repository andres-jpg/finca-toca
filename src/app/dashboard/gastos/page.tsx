import { getGastos } from "@/features/gastos/actions/gastos.actions";
import { GastosTable } from "@/features/gastos/components/gastos-table";

export default async function GastosPage() {
  const gastos = await getGastos();

  return (
    <div className="max-w-5xl mx-auto">
      <GastosTable gastos={gastos} />
    </div>
  );
}
