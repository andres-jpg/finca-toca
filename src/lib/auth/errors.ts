/**
 * Denegación de acceso lanzada por `requireRole()` / `requireModuloTenant()`.
 *
 * Clase propia —con el mismo mensaje de siempre, "No autorizado"— para que Sentry pueda
 * reconocerla y no la reporte: un acceso denegado es el sistema funcionando, no un fallo.
 * Los filtros (`lib/sentry/filtros.ts`) la identifican por `name`, que sobrevive al bundler.
 */
export class AuthorizationError extends Error {
  constructor(message = "No autorizado") {
    super(message);
    this.name = "AuthorizationError";
  }
}
