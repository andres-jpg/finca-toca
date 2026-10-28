import Link from "next/link";
import { requirePlatformAdminPagina } from "@/modules/core/platform/guards";

// Backoffice de plataforma: fuera del dashboard de los clientes y de su navegación. El layout y cada página
// llaman al guard (se renderizan en paralelo; ninguno puede fiarse del otro).
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformAdminPagina();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/admin/tenants" className="font-semibold">
            Plataforma · Clientes
          </Link>
          <Link href="/dashboard" className="text-muted-foreground text-sm hover:underline">
            Ir al dashboard
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
