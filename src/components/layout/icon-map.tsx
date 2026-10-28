"use client";

import type { ElementType } from "react";
import {
  LayoutDashboard,
  ArrowDownCircle,
  ArrowUpCircle,
  Droplets,
  Settings,
  Building2,
  MapPin,
  ClipboardList,
  Package,
  FileSpreadsheet,
  Users,
  UserCog,
  Route,
  Banknote,
  History,
  KeyRound,
  CalendarClock,
  Handshake,
  SlidersHorizontal,
  Boxes,
  Coffee,
} from "lucide-react";
import { PiCow } from "react-icons/pi";
import type { IconoNav } from "@/modules/core/registry/iconos";

/**
 * Resuelve el nombre de icono de un manifiesto (`NavItemDef.icon`) al componente. Es cliente porque los
 * componentes no viajan del servidor al navegador; el manifiesto solo lleva el nombre. El `Record`
 * exige una entrada por cada nombre de `ICONOS_NAV`.
 */
export const ICONOS: Record<IconoNav, ElementType> = {
  LayoutDashboard,
  ArrowDownCircle,
  ArrowUpCircle,
  Droplets,
  PiCow,
  CalendarClock,
  Package,
  KeyRound,
  Settings,
  Building2,
  MapPin,
  Route,
  ClipboardList,
  History,
  FileSpreadsheet,
  Banknote,
  Users,
  UserCog,
  Handshake,
  SlidersHorizontal,
  Boxes,
  Coffee,
};
