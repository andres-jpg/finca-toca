"use client";

import { signOut } from "@/features/auth/actions/auth.actions";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import type { UserRole } from "@/types";

interface HeaderProps {
  email: string;
  role?: UserRole | null;
  onOpenMobileMenu?: () => void;
}

export function Header({ email, role, onOpenMobileMenu }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 bg-white border-b sticky top-0 z-30 shadow-sm">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5 text-gray-700" />
        </button>
        <span className="text-xs sm:text-sm text-gray-600 truncate">{email}</span>
        {role && (
          <span className="hidden sm:inline-block text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded flex-shrink-0">
            {role === "admin" ? "Admin" : role === "viewer" ? "Viewer" : "Usuario"}
          </span>
        )}
      </div>
      <form action={signOut}>
        <Button variant="outline" size="sm" type="submit" className="flex-shrink-0">
          <span className="hidden sm:inline">Cerrar sesión</span>
          <span className="sm:hidden">Salir</span>
        </Button>
      </form>
    </header>
  );
}
