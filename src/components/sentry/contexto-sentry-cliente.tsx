"use client";

import { useEffect } from "react";
import { aplicarContextoSentry, limpiarContextoSentry } from "@/lib/sentry/etiquetas";

/**
 * Pone `tenant`, `rol` y `user.id` (nunca el email) en el ámbito de Sentry **del navegador**.
 *
 * El layout del dashboard ya los pone en el servidor (`registrarContextoSentry`), pero ese
 * ámbito no viaja al cliente: sin esto, un error de React o de un handler del navegador
 * llegaría a Sentry sin decir qué cliente lo sufre. No renderiza nada.
 */
export function ContextoSentryCliente({
  userId,
  rol,
  tenantSlug,
}: {
  userId: string | null;
  rol: string | null;
  tenantSlug: string | null;
}) {
  useEffect(() => {
    aplicarContextoSentry({ userId, rol, tenantSlug });
    return limpiarContextoSentry;
  }, [userId, rol, tenantSlug]);

  return null;
}
