import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getUserRole } from "@/lib/auth/get-user-role";
import { DashboardLayoutClient } from "@/components/layout/dashboard-layout-client";

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

  return (
    <DashboardLayoutClient
      email={session.user.email ?? ""}
      userRole={userRole}
    >
      {children}
    </DashboardLayoutClient>
  );
}
