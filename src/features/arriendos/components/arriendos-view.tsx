"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Plus, Pencil, Trash2, Wallet, FileText, Coins, HandCoins } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { EntityModal } from "@/components/shared/entity-modal";
import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArriendoForm } from "@/features/arriendos/components/arriendo-form";
import { AbonosPanel } from "@/features/arriendos/components/abonos-panel";
import { deleteArriendo } from "@/features/arriendos/actions/arriendos.actions";
import { formatMoneda } from "@/features/arriendos/lib/moneda";
import { toast } from "sonner";
import type { Arriendo } from "@/types";

const fmtFecha = (fecha: string) =>
  format(new Date(fecha + "T00:00:00"), "dd/MM/yyyy", { locale: es });

type EstadoArriendo = "pagado" | "vencido" | "pendiente";

/** `vencido` = queda saldo y la fecha de fin ya pasó. */
function estadoDe(arriendo: Arriendo, hoy: Date): EstadoArriendo {
  if (arriendo.saldo <= 0) return "pagado";
  return new Date(arriendo.fecha_fin + "T00:00:00") < hoy ? "vencido" : "pendiente";
}

const ESTADO_CONFIG: Record<EstadoArriendo, { label: string; classes: string }> = {
  pagado: { label: "Pagado", classes: "bg-green-100 text-green-700 hover:bg-green-100" },
  vencido: { label: "Vencido", classes: "bg-red-100 text-red-700 hover:bg-red-100" },
  pendiente: { label: "Pendiente", classes: "bg-amber-100 text-amber-700 hover:bg-amber-100" },
};

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 flex items-center gap-3">
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold text-gray-900 truncate">{value}</p>
      </div>
    </div>
  );
}

function RowActions({ arriendo, canEdit }: { arriendo: Arriendo; canEdit: boolean }) {
  const [abonosOpen, setAbonosOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteArriendo(arriendo.id);
      toast.success("Arriendo eliminado");
      setDeleteOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo eliminar el arriendo"
      );
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setAbonosOpen(true)}
          className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          title="Ver abonos"
        >
          <Wallet className="h-3.5 w-3.5" />
        </button>
        {canEdit && (
          <>
            <button
              onClick={() => setEditOpen(true)}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title="Editar arriendo"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setDeleteOpen(true)}
              className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Eliminar arriendo"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      {/* El panel recibe `arriendo` por props: tras cada abono, `revalidatePath` refresca la
          página y el saldo del panel abierto se actualiza solo. */}
      <EntityModal
        open={abonosOpen}
        onClose={() => setAbonosOpen(false)}
        title="Abonos del arriendo"
      >
        <AbonosPanel arriendo={arriendo} canEdit={canEdit} />
      </EntityModal>

      {canEdit && (
        <>
          <EntityModal
            open={editOpen}
            onClose={() => setEditOpen(false)}
            title="Editar arriendo"
          >
            <ArriendoForm arriendo={arriendo} onSuccess={() => setEditOpen(false)} />
          </EntityModal>

          <DeleteConfirmationDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            onConfirm={handleDelete}
            description={`Se eliminará el arriendo de ${arriendo.finca_nombre} (${arriendo.arrendatario}), sus ${arriendo.abonos.length} abono(s) y los gastos que estos generaron. Esta acción no se puede deshacer.`}
          />
        </>
      )}
    </>
  );
}

interface ArriendosViewProps {
  arriendos: Arriendo[];
  canEdit: boolean;
}

export function ArriendosView({ arriendos, canEdit }: ArriendosViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  // Una sola referencia de "hoy" por render: así todas las filas se comparan contra el
  // mismo instante y el estado no depende de cuándo se pinta cada celda.
  const hoy = useMemo(() => new Date(), []);

  const totales = useMemo(
    () =>
      arriendos.reduce(
        (acc, a) => ({
          canon: acc.canon + a.canon,
          abonado: acc.abonado + a.total_abonado,
          // Un arriendo abonado de más no compensa el saldo de otro.
          saldo: acc.saldo + Math.max(0, a.saldo),
        }),
        { canon: 0, abonado: 0, saldo: 0 }
      ),
    [arriendos]
  );

  const columns: ColumnDef<Arriendo>[] = useMemo(
    () => [
      {
        accessorKey: "arrendatario",
        header: "Arrendatario",
        cell: ({ row }) => (
          <span className="font-medium text-gray-800">{row.original.arrendatario}</span>
        ),
      },
      {
        accessorKey: "finca_nombre",
        header: "Finca",
      },
      {
        id: "periodo",
        header: "Período",
        accessorFn: (row) => row.fecha_inicio,
        cell: ({ row }) => (
          <span className="text-gray-600">
            {fmtFecha(row.original.fecha_inicio)} — {fmtFecha(row.original.fecha_fin)}
          </span>
        ),
      },
      {
        accessorKey: "canon",
        header: "Canon",
        cell: ({ getValue }) => (
          <span className="font-medium">{formatMoneda(getValue<number>())}</span>
        ),
      },
      {
        accessorKey: "total_abonado",
        header: "Abonado",
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-green-600">
              {formatMoneda(row.original.total_abonado)}
            </p>
            <p className="text-xs text-gray-400">{row.original.abonos.length} abono(s)</p>
          </div>
        ),
      },
      {
        accessorKey: "saldo",
        header: "Saldo",
        cell: ({ getValue }) => {
          const saldo = getValue<number>();
          return (
            <span className={`font-semibold ${saldo <= 0 ? "text-green-600" : "text-amber-600"}`}>
              {formatMoneda(saldo)}
            </span>
          );
        },
      },
      {
        id: "estado",
        header: "Estado",
        cell: ({ row }) => {
          const config = ESTADO_CONFIG[estadoDe(row.original, hoy)];
          return <Badge className={config.classes}>{config.label}</Badge>;
        },
      },
      {
        id: "actions",
        header: "Acciones",
        cell: ({ row }) => <RowActions arriendo={row.original} canEdit={canEdit} />,
      },
    ],
    [canEdit, hoy]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 tracking-tight">
            Arriendos
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {arriendos.length} contrato(s) · cada abono se contabiliza automáticamente como
            gasto del mes en que se paga
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setModalOpen(true)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo arriendo
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={FileText}
          label="Contratos"
          value={String(arriendos.length)}
          color="bg-gray-100 text-gray-600"
        />
        <StatCard
          icon={Coins}
          label="Canon total"
          value={formatMoneda(totales.canon)}
          color="bg-blue-100 text-blue-600"
        />
        <StatCard
          icon={HandCoins}
          label="Total abonado"
          value={formatMoneda(totales.abonado)}
          color="bg-green-100 text-green-600"
        />
        <StatCard
          icon={Wallet}
          label="Saldo pendiente"
          value={formatMoneda(totales.saldo)}
          color="bg-amber-100 text-amber-600"
        />
      </div>

      <DataTable
        data={arriendos}
        columns={columns}
        filterPlaceholder="Buscar por arrendatario, finca..."
      />

      {canEdit && (
        <EntityModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Nuevo arriendo"
        >
          <ArriendoForm onSuccess={() => setModalOpen(false)} />
        </EntityModal>
      )}
    </div>
  );
}
