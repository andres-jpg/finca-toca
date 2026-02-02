import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { getUserRole } from "@/lib/auth/get-user-role";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const userRole = await getUserRole();
  console.log("🎭 DashboardLayout - Rol del usuario:", userRole);

  return (
    <div className="flex min-h-screen">
      <Sidebar role={userRole} />
      <div className="flex-1 flex flex-col">
        <Header email={session.user.email ?? ""} role={userRole} />
        <main className="flex-1 p-6 bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  );
}
