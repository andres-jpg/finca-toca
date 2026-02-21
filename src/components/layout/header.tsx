"use client";

import { signOut } from "@/features/auth/actions/auth.actions";
import { Menu, LogOut } from "lucide-react";
import type { UserRole } from "@/types";

interface HeaderProps {
  email: string;
  onOpenMobileMenu?: () => void;
}

export function Header({ email, onOpenMobileMenu }: HeaderProps) {

  return (
    <header className="h-16 flex items-center justify-between px-4 sm:px-6 bg-white border-b border-stone-200 sticky top-0 z-30 text-stone-900">
      <button
        onClick={onOpenMobileMenu}
        className="lg:hidden p-2 -ml-1 hover:bg-stone-200 rounded-lg transition-colors text-stone-700"
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex items-center gap-3 ml-auto">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="min-w-0">
            <p className="text-xs font-medium text-stone-900 truncate max-w-[180px]">{email}</p>
          </div>
        </div>

        <div className="h-5 w-px bg-stone-300 shrink-0 mx-1" aria-hidden />

        <form action={signOut}>
          <button
            type="submit"
            className="flex items-center gap-1.5 text-xs font-medium text-stone-700 hover:text-stone-900 transition-colors px-2.5 py-2 rounded-lg hover:bg-stone-200"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </form>
      </div>
    </header>
  );
}
