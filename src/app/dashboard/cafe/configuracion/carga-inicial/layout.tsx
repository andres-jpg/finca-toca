import { ConfiguracionTabs } from "@/modules/cafe/configuracion/components/configuracion-tabs";

// B-15: en el café la carga inicial es una pestaña de Configuración (solo propietario y administrador).
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ConfiguracionTabs />
      {children}
    </>
  );
}
