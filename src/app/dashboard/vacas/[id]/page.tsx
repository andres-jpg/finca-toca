import { redirect } from "next/navigation";

export default async function VacaFichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/animales/${id}`);
}
