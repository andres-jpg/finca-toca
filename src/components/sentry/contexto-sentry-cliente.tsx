"use client";

import { useEffect } from "react";
import { aplicarContextoSentry, limpiarContextoSentry } from "@/lib/sentry/etiquetas";

/**
 * Pone `tenant`, `vertical`, `rol` y `user.id` (nunca el email) en el ámbito de Sentry **del navegador**.
 *
 * El layout del dashboard ya los pone en el servidor (`registrarContextoSentry`), pero ese
 * ámbito no viaja al cliente: sin esto, un error de React o de un handler del navegador
 * llegaría a Sentry sin decir qué cliente lo sufre. No renderiza nada.
 */
export function ContextoSentryCliente({
  userId,
  rol,
  tenantSlug,
  vertical = null,
}: {
  userId: string | null;
  rol: string | null;
  tenantSlug: string | null;
  vertical?: string | null;
}) {
  useEffect(() => {
    aplicarContextoSentry({ userId, rol, tenantSlug, vertical });
    return limpiarContextoSentry;
  }, [userId, rol, tenantSlug, vertical]);

  return null;
}
