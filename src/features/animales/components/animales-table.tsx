"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, ArrowUpCircle, Eye, RefreshCw } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { EntityModal } from "@/components/shared/entity-modal";
import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog";
import { AnimalForm } from "@/features/animales/components/animal-form";
import {
  recalcularEstadosPorEdad,
  venderAnimal,
} from "@/features/animales/actions/animales.actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ESTADOS_PRODUCTIVOS,
  ESTADOS_REPRODUCTIVOS,
  ESTADO_PRODUCTIVO_COLORS,
  ESTADO_PRODUCTIVO_LABELS,
  ESTADO_REPRODUCTIVO_COLORS,
  ESTADO_REPRODUCTIVO_LABELS,
} from "@/lib/animales/estados";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type {
  Animal,
  AnimalSexo,
  EstadoProductivo,
  EstadoReproductivo,
  PajillaPorToro,
} from "@/types";

const ORIGEN_LABELS: Record<string, string> = {
  finca: "Finca",
  externa: "Externa",
};

const SEXO_FILTROS: { value: "todos" | AnimalSexo; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "hembra", label: "Hembras" },
  { value: "macho", label: "Machos" },
];

const TODOS = "todos";

function RowActions({
  animal,
  animales,
  pajillasPorToro,
  canEdit,
}: {
  animal: Animal;
  animales: Animal[];
  pajillasPorToro: PajillaPorToro[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleDelete = async () => {
    try {
      await venderAnimal(animal.id);
      toast.success("Animal dado de baja");
      setDeleteOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo dar de baja el animal");
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          onClick={() => router.push(`/dashboard/animales/${animal.id}`)}
          className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          title="Ver ficha"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
        {canEdit && (
          <>
            <button
              onClick={() => setEditOpen(true)}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title="Editar"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {animal.alta && (
              <button
                onClick={() => setDeleteOpen(true)}
                className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                title="Dar de baja"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        )}
      </div>

      {canEdit && (
        <EntityModal open={editOpen} onClose={() => setEditOpen(false)} title="Editar animal">
          <AnimalForm
            animal={animal}
            animales={animales}
            pajillasPorToro={pajillasPorToro}
            onSuccess={() => setEditOpen(false)}
          />
        </EntityModal>
      )}

      <DeleteConfirmationDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
        title="¿Dar de baja este animal?"
        description={`"${animal.nombre} (#${animal.identificador})" pasará a la lista de bajas. Podrás consultarlo desde "Ver de baja".`}
        confirmLabel="Dar de baja"
      />
    </>
  );
}

interface AnimalesTableProps {
  animales: Animal[];
  pajillasPorToro: PajillaPorToro[];
  canEdit: boolean;
  /** Filtros iniciales desde los enlaces del dashboard (?productivo= / ?reproductivo=). */
  filtroProductivoInicial?: string;
  filtroReproductivoInicial?: string;
}

export function AnimalesTable({
  animales,
  pajillasPorToro,
  canEdit,
  filtroProductivoInicial = TODOS,
  filtroReproductivoInicial = TODOS,
}: AnimalesTableProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [mostrarDeBaja, setMostrarDeBaja] = useState(false);
  const [sexoFiltro, setSexoFiltro] = useState<"todos" | AnimalSexo>("todos");
  const [productivoFiltro, setProductivoFiltro] = useState<string>(filtroProductivoInicial);
  const [reproductivoFiltro, setReproductivoFiltro] = useState<string>(
    filtroReproductivoInicial
  );

  const router = useRouter();
  const [recalculando, startRecalculo] = useTransition();

  const animalesDeAlta = useMemo(() => animales.filter((a) => a.alta), [animales]);
  const animalesDeBaja = useMemo(() => animales.filter((a) => !a.alta), [animales]);
  const animalesBase = mostrarDeBaja ? animalesDeBaja : animalesDeAlta;

  const animalesMostrados = useMemo(
    () =>
      animalesBase.filter(
        (a) =>
          (sexoFiltro === TODOS || a.sexo === sexoFiltro) &&
          (productivoFiltro === TODOS || a.estado_productivo === productivoFiltro) &&
          (reproductivoFiltro === TODOS || a.estado_reproductivo === reproductivoFiltro)
      ),
    [animalesBase, sexoFiltro, productivoFiltro, reproductivoFiltro]
  );

  // Los contadores de cada opción se calculan sobre el resto de filtros ya aplicados,
  // para que no aparezcan opciones con "(0)" que en realidad sí tienen animales.
  const contarProductivo = (estado: EstadoProductivo) =>
    animalesBase.filter(
      (a) =>
        a.estado_productivo === estado &&
        (sexoFiltro === TODOS || a.sexo === sexoFiltro) &&
        (reproductivoFiltro === TODOS || a.estado_reproductivo === reproductivoFiltro)
    ).length;

  const contarReproductivo = (estado: EstadoReproductivo) =>
    animalesBase.filter(
      (a) =>
        a.estado_reproductivo === estado &&
        (sexoFiltro === TODOS || a.sexo === sexoFiltro) &&
        (productivoFiltro === TODOS || a.estado_productivo === productivoFiltro)
    ).length;

  const hayFiltroEstado = productivoFiltro !== TODOS || reproductivoFiltro !== TODOS;

  const handleRecalcular = () => {
    startRecalculo(async () => {
      try {
        const cambios = await recalcularEstadosPorEdad();
        toast.success(
          cambios === 0
            ? "Todos los estados por edad ya estaban al día"
            : `${cambios} animal(es) avanzaron de estado`
        );
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "No se pudieron recalcular los estados"
        );
      }
    });
  };

  const columns: ColumnDef<Animal>[] = useMemo(
    () => [
      {
        accessorKey: "identificador",
        header: "ID",
        cell: ({ getValue }) => (
          <span className="font-mono text-gray-500">#{getValue<string>()}</span>
        ),
      },
      { accessorKey: "nombre", header: "Nombre" },
      {
        accessorKey: "sexo",
        header: "Sexo",
        cell: ({ getValue }) => {
          const val = getValue<AnimalSexo>();
          return (
            <Badge
              variant="outline"
              className={val === "hembra" ? "text-pink-600 border-pink-300" : "text-sky-600 border-sky-300"}
            >
              {val === "hembra" ? "Hembra" : "Macho"}
            </Badge>
          );
        },
      },
      {
        accessorKey: "estado_productivo",
        header: "Productivo",
        cell: ({ getValue }) => {
          const val = getValue<EstadoProductivo | null>();
          if (!val) return <span className="text-gray-400">—</span>;
          return (
            <Badge className={ESTADO_PRODUCTIVO_COLORS[val]}>
              {ESTADO_PRODUCTIVO_LABELS[val]}
            </Badge>
          );
        },
      },
      {
        accessorKey: "estado_reproductivo",
        header: "Reproductivo",
        cell: ({ getValue }) => {
          const val = getValue<EstadoReproductivo | null>();
          if (!val) return <span className="text-gray-400">—</span>;
          return (
            <Badge className={ESTADO_REPRODUCTIVO_COLORS[val]}>
              {ESTADO_REPRODUCTIVO_LABELS[val]}
            </Badge>
          );
        },
      },
      {
        accessorKey: "origen",
        header: "Origen",
        cell: ({ getValue }) => {
          const val = getValue<string | null>();
          if (!val) return <span className="text-gray-400">—</span>;
          return (
            <Badge
              variant="outline"
              className={val === "externa" ? "text-orange-600 border-orange-300" : "text-gray-600"}
            >
              {ORIGEN_LABELS[val] ?? val}
            </Badge>
          );
        },
      },
      {
        accessorKey: "madre_nombre",
        header: "Madre",
        cell: ({ getValue }) => getValue<string | null>() ?? "—",
      },
      {
        id: "actions",
        header: "Acciones",
        cell: ({ row }) => (
          <RowActions
            animal={row.original}
            animales={animalesDeAlta}
            pajillasPorToro={pajillasPorToro}
            canEdit={canEdit}
          />
        ),
      },
    ],
    [canEdit, animalesDeAlta, pajillasPorToro]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 tracking-tight">Animales</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {mostrarDeBaja
              ? `${animalesMostrados.length} animal(es) de baja`
              : `${animalesMostrados.length} animal(es) de alta`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button
            variant="outline"
            onClick={() => setMostrarDeBaja((v) => !v)}
            className={mostrarDeBaja ? "border-orange-400 text-orange-600 hover:bg-orange-50" : ""}
          >
            <ArrowUpCircle className="h-4 w-4 mr-2" />
            {mostrarDeBaja ? "Ver de alta" : "Ver de baja"}
            {!mostrarDeBaja && animalesDeBaja.length > 0 && (
              <span className="ml-1.5 text-xs bg-orange-100 text-orange-600 rounded-full px-1.5 py-0.5">
                {animalesDeBaja.length}
              </span>
            )}
          </Button>
          {canEdit && (
            <Button variant="outline" onClick={handleRecalcular} disabled={recalculando}>
              <RefreshCw className={cn("h-4 w-4 mr-2", recalculando && "animate-spin")} />
              Recalcular estados
            </Button>
          )}
          {canEdit && !mostrarDeBaja && (
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Agregar Animal
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          {SEXO_FILTROS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setSexoFiltro(value)}
              className={cn(
                "px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors",
                sexoFiltro === value
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <Select value={productivoFiltro} onValueChange={setProductivoFiltro}>
          <SelectTrigger className="w-[190px]">
            <SelectValue placeholder="Estado productivo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todo estado productivo</SelectItem>
            {ESTADOS_PRODUCTIVOS.map((estado) => (
              <SelectItem key={estado} value={estado}>
                {ESTADO_PRODUCTIVO_LABELS[estado]} ({contarProductivo(estado)})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={reproductivoFiltro} onValueChange={setReproductivoFiltro}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Estado reproductivo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todo estado reproductivo</SelectItem>
            {ESTADOS_REPRODUCTIVOS.map((estado) => (
              <SelectItem key={estado} value={estado}>
                {ESTADO_REPRODUCTIVO_LABELS[estado]} ({contarReproductivo(estado)})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hayFiltroEstado && (
          <button
            type="button"
            onClick={() => {
              setProductivoFiltro(TODOS);
              setReproductivoFiltro(TODOS);
            }}
            className="text-sm text-gray-500 hover:text-gray-800 underline underline-offset-2"
          >
            Limpiar
          </button>
        )}
      </div>

      <DataTable data={animalesMostrados} columns={columns} filterPlaceholder="  Buscar animal..." />

      {canEdit && (
        <EntityModal open={modalOpen} onClose={() => setModalOpen(false)} title="Nuevo animal">
          <AnimalForm
            animales={animalesDeAlta}
            pajillasPorToro={pajillasPorToro}
            onSuccess={() => setModalOpen(false)}
          />
        </EntityModal>
      )}
    </div>
  );
}
