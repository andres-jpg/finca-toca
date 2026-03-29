# Finca Toca - Sistema de Gestión Agropecuaria

Finca Toca es una plataforma integral diseñada para la gestión eficiente de actividades agropecuarias, con un enfoque principal en el control de ganado vacuno, producción lechera y administración financiera.

## 🚀 Resumen del Proyecto

Este sistema permite a los administradores de fincas llevar un registro detallado de:
- **Inventario Ganadero:** Control individual de vacas y toros (estados de producción, salud y genealogía).
- **Producción Lechera:** Registro diario de extracciones y cálculo de rendimientos promedio por animal.
- **Gestión Financiera:** Seguimiento exhaustivo de ingresos y gastos operativos.
- **Análisis de Datos:** Dashboards interactivos con métricas clave para la toma de decisiones.

## 🛠️ Tecnologías Utilizadas

### Core
- **Framework:** [Next.js 15 (App Router)](https://nextjs.org/)
- **Lenguaje:** [TypeScript](https://www.typescriptlang.org/)
- **Base de Datos & Auth:** [Supabase](https://supabase.com/)
- **Estilos:** [Tailwind CSS 4](https://tailwindcss.com/)

### Librerías & Dependencias Clave
- **UI Components:** [Radix UI](https://www.radix-ui.com/) y [Shadcn/UI](https://ui.shadcn.com/)
- **Formularios:** [React Hook Form](https://react-hook-form.com/) con validación [Zod](https://zod.dev/)
- **Gráficos:** [Recharts](https://recharts.org/)
- **Tablas:** [TanStack Table (React Table)](https://tanstack.com/table)
- **Iconografía:** [Lucide React](https://lucide.dev/)
- **Notificaciones:** [Sonner](https://sonner.emilkowal.ski/)

## 📦 Módulos del Sistema

El proyecto está organizado en una arquitectura basada en características (`features`):
- **Auth:** Sistema de autenticación y manejo de sesiones.
- **Vacas / Toros:** Gestión de inventario animal.
- **Extracciones:** Control de producción de leche.
- **Gastos / Ingresos:** Contabilidad operativa.
- **Precios:** Histórico y configuración de precios de mercado.

## ⚙️ Configuración y Arranque

### Requisitos Previos
- Node.js (v20 o superior)
- Una instancia de Supabase configurada.

### Instalación

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/tu-usuario/finca-toca.git
   cd finca-toca
   ```

2. Instalar dependencias:
   ```bash
   npm install
   # o si prefieres pnpm
   pnpm install
   ```

3. Configurar variables de entorno:
   Crea un archivo `.env.local` en la raíz con las siguientes claves de Supabase:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=tu_url_de_supabase
   NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
   ```

4. Ejecutar el servidor de desarrollo:
   ```bash
   npm run dev
   ```
   Accede a [http://localhost:3000](http://localhost:3000) para ver la aplicación.

## 📊 Arquitectura del Proyecto

- `src/app`: Rutas y lógica de servidor de Next.js.
- `src/features`: Lógica de negocio segmentada por dominio (actions, components, schemas).
- `src/components/ui`: Componentes de interfaz base y reutilizables.
- `src/lib/supabase`: Configuración del cliente y servidor de base de datos.
- `src/types`: Definiciones globales de TypeScript.

---
Desarrollado para optimizar la productividad en el campo.
