"use client";

import { signOut } from "@/features/auth/actions/auth.actions";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  email: string;
}

export function Header({ email }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-6 py-3 bg-white border-b">
      <span className="text-sm text-gray-600">{email}</span>
      <form action={signOut}>
        <Button variant="outline" size="sm" type="submit">
          Cerrar sesión
        </Button>
      </form>
    </header>
  );
}
