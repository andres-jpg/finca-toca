"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ETIQUETA_ESTADO, ETIQUETA_VERTICAL, VERTICALES } from "../lib/nucleo";
import type { TenantResumen } from "../types";

const CLASE_SELECT =
  "border-input h-9 rounded-md border bg-transparent px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm";

const fechaAlta = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" }).format(new Date(iso));

export function TenantsTable({ tenants }: { tenants: TenantResumen[] }) {
  const [q, setQ] = useState("");
  const [vertical, setVertical] = useState("");

  const filtrados = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return tenants.filter(
      (t) =>
        (vertical === "" || t.vertical === vertical) &&
        (texto === "" || t.nombre.toLowerCase().includes(texto) || t.slug.includes(texto)),
    );
  }, [tenants, q, vertical]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          placeholder="Buscar por nombre o identificador"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar cliente"
        />
        <select
          className={CLASE_SELECT}
          value={vertical}
          onChange={(e) => setVertical(e.target.value)}
          aria-label="Filtrar por vertical"
        >
          <option value="">Todos los verticales</option>
          {VERTICALES.map((v) => (
            <option key={v} value={v}>
              {ETIQUETA_VERTICAL[v]}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">Vertical</th>
              <th className="px-3 py-2 font-medium">Plan</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 text-right font-medium">Miembros</th>
              <th className="px-3 py-2 font-medium">Alta</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtrados.map((t) => (
              <tr key={t.id}>
                <td className="px-3 py-2">
                  <Link href={`/admin/tenants/${t.id}`} className="font-medium underline-offset-2 hover:underline">
                    {t.nombre}
                  </Link>
                  <div className="text-muted-foreground text-xs">{t.slug}</div>
                </td>
                <td className="px-3 py-2">{ETIQUETA_VERTICAL[t.vertical]}</td>
                <td className="px-3 py-2">{t.plan}</td>
                <td className="px-3 py-2">
                  <Badge variant={t.estado === "activo" ? "default" : "secondary"}>{ETIQUETA_ESTADO[t.estado]}</Badge>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{t.miembros}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fechaAlta(t.created_at)}</td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={6} className="text-muted-foreground px-3 py-6 text-center">
                  Ningún cliente coincide.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
