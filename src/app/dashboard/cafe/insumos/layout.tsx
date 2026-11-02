import { ConfiguracionTabs } from "@/modules/cafe/configuracion/components/configuracion-tabs";

// A-07: en el café esta pantalla es una pestaña de Configuración; en otros verticales/roles no pinta nada.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ConfiguracionTabs />
      {children}
    </>
  );
}
