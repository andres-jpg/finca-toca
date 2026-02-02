"use client";

import { signOut } from "@/features/auth/actions/auth.actions";
import { Button } from "@/components/ui/button";
import type { UserRole } from "@/types";

interface HeaderProps {
  email: string;
  role?: UserRole | null;
}

export function Header({ email, role }: HeaderProps) {
  console.log("🎫 Header - Rol recibido:", role);

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-white border-b">
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600">{email}</span>
        {role && (
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
            {role === "admin" ? "Admin" : "Usuario"}
          </span>
        )}
      </div>
      <form action={signOut}>
        <Button variant="outline" size="sm" type="submit">
          Cerrar sesión
        </Button>
      </form>
    </header>
  );
}
