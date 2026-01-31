import { getMilkings } from "@/features/milkings/actions/milkings.actions";
import { MilkingsTable } from "@/features/milkings/components/milkings-table";

export default async function MilkingsPage() {
  const milkings = await getMilkings();

  return (
    <div className="max-w-5xl mx-auto">
      <MilkingsTable milkings={milkings} />
    </div>
  );
}
