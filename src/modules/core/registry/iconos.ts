/**
 * Nombres de icono que pueden usar los manifiestos. Es una lista **pura** (sin React) a propósito:
 * el manifiesto vive en el servidor y viaja a la barra lateral como datos serializables, así que el
 * icono es un nombre y el componente se resuelve en el cliente (`components/layout/icon-map.tsx`,
 * que exige una entrada por cada nombre de aquí: añadir uno sin su icono no compila).
 */
export const ICONOS_NAV = [
  "LayoutDashboard",
  "ArrowDownCircle",
  "ArrowUpCircle",
  "Droplets",
  "PiCow",
  "CalendarClock",
  "Package",
  "KeyRound",
  "Settings",
  "Building2",
  "MapPin",
  "Route",
  "ClipboardList",
  "History",
  "FileSpreadsheet",
  "Banknote",
  "Users",
  "UserCog",
  "Handshake",
  "SlidersHorizontal",
  "Boxes",
  "Coffee",
  "Factory",
] as const;

export type IconoNav = (typeof ICONOS_NAV)[number];
