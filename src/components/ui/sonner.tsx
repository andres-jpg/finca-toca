"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      // Siempre claro y con texto oscuro: título y descripción deben leerse bien en cualquier aviso.
      theme="light"
      toastOptions={{
        classNames: {
          toast: "!bg-white !text-gray-900 !border-gray-300",
          title: "!text-gray-900 !font-semibold",
          description: "!text-gray-800",
          icon: "!text-gray-900",
        },
      }}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "#ffffff",
          "--normal-text": "#111827",
          "--normal-border": "#d1d5db",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
