/**
 * Línea base del menú de la barra lateral ANTES de FIN-92 (cuando `sidebar.tsx` tenía el array `navItems`
 * hardcodeado): para cada usuario del seed, las entradas que mostraba, en orden. Se calculó ejecutando la
 * lógica de filtro de entonces (rol + `hideInPWA` para `cooperativa_user` + módulo) sobre las 18 entradas del
 * array. `getNavParaSesion()` tiene que reproducirla exactamente: es el criterio de aceptación de FIN-92.
 * No la "actualices" para que un test pase: si cambia, es que el menú de alguien cambió.
 */
export const MENU_BASELINE: Record<string, { href: string; label: string; icon: string }[]> = {
  "admin@vb.test": [
    { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
    { href: "/dashboard/gastos", label: "Gastos", icon: "ArrowDownCircle" },
    { href: "/dashboard/ingresos", label: "Ingresos", icon: "ArrowUpCircle" },
    { href: "/dashboard/extracciones", label: "Extracciones", icon: "Droplets" },
    { href: "/dashboard/animales", label: "Animales", icon: "PiCow" },
    { href: "/dashboard/informe-avanzado", label: "Informe avanzado", icon: "CalendarClock" },
    { href: "/dashboard/inventario", label: "Inventario", icon: "Package" },
    { href: "/dashboard/arriendos", label: "Arriendos", icon: "KeyRound" },
    { href: "/dashboard/configuracion", label: "Configuración", icon: "Settings" },
  ],
  "user@vb.test": [
    { href: "/dashboard/extracciones", label: "Extracciones", icon: "Droplets" },
  ],
  "viewer@vb.test": [
    { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
    { href: "/dashboard/gastos", label: "Gastos", icon: "ArrowDownCircle" },
    { href: "/dashboard/ingresos", label: "Ingresos", icon: "ArrowUpCircle" },
    { href: "/dashboard/extracciones", label: "Extracciones", icon: "Droplets" },
    { href: "/dashboard/animales", label: "Animales", icon: "PiCow" },
    { href: "/dashboard/informe-avanzado", label: "Informe avanzado", icon: "CalendarClock" },
    { href: "/dashboard/inventario", label: "Inventario", icon: "Package" },
    { href: "/dashboard/arriendos", label: "Arriendos", icon: "KeyRound" },
  ],
  "admin@velero.test": [
    { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
    { href: "/dashboard/gastos", label: "Gastos", icon: "ArrowDownCircle" },
    { href: "/dashboard/ingresos", label: "Ingresos", icon: "ArrowUpCircle" },
    { href: "/dashboard/extracciones", label: "Extracciones", icon: "Droplets" },
    { href: "/dashboard/animales", label: "Animales", icon: "PiCow" },
    { href: "/dashboard/informe-avanzado", label: "Informe avanzado", icon: "CalendarClock" },
    { href: "/dashboard/inventario", label: "Inventario", icon: "Package" },
    { href: "/dashboard/configuracion", label: "Configuración", icon: "Settings" },
  ],
  "coop.admin@test|web": [
    { href: "/dashboard/cooperativa", label: "Dashboard Coop.", icon: "LayoutDashboard" },
    { href: "/dashboard/fincas-cooperativa", label: "Fincas", icon: "Building2" },
    { href: "/dashboard/rutas-cooperativa", label: "Rutas", icon: "MapPin" },
    { href: "/dashboard/itinerarios", label: "Itinerarios", icon: "Route" },
    { href: "/dashboard/recolecciones", label: "Recolecciones", icon: "ClipboardList" },
    { href: "/dashboard/informes-cooperativa", label: "Informes", icon: "FileSpreadsheet" },
    { href: "/dashboard/pagos-cooperativa", label: "Pagos", icon: "Banknote" },
    { href: "/dashboard/usuarios-cooperativa", label: "Usuarios", icon: "Users" },
  ],
  "coop.admin@test|pwa": [
    { href: "/dashboard/cooperativa", label: "Dashboard Coop.", icon: "LayoutDashboard" },
    { href: "/dashboard/fincas-cooperativa", label: "Fincas", icon: "Building2" },
    { href: "/dashboard/rutas-cooperativa", label: "Rutas", icon: "MapPin" },
    { href: "/dashboard/itinerarios", label: "Itinerarios", icon: "Route" },
    { href: "/dashboard/recolecciones", label: "Recolecciones", icon: "ClipboardList" },
    { href: "/dashboard/informes-cooperativa", label: "Informes", icon: "FileSpreadsheet" },
    { href: "/dashboard/pagos-cooperativa", label: "Pagos", icon: "Banknote" },
    { href: "/dashboard/usuarios-cooperativa", label: "Usuarios", icon: "Users" },
  ],
  "coop.user@test|web": [
    { href: "/dashboard/itinerarios", label: "Itinerarios", icon: "Route" },
    { href: "/dashboard/recolecciones", label: "Recolecciones", icon: "ClipboardList" },
    { href: "/dashboard/mi-historial", label: "Mi historial", icon: "History" },
  ],
  "coop.user@test|pwa": [
    { href: "/dashboard/recolecciones", label: "Recolecciones", icon: "ClipboardList" },
    { href: "/dashboard/mi-historial", label: "Mi historial", icon: "History" },
  ],
};
