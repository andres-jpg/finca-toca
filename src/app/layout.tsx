import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ToastProvider } from "@/components/layout/toast-provider";
import { Analytics } from "@vercel/analytics/next";
import { NOMBRE_PLATAFORMA } from "@/lib/plataforma";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: NOMBRE_PLATAFORMA,
  description: "Panel de gestión de finca y recolección de leche",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TocaLácteos",
  },
  icons: {
    icon: "/icon.png",
    apple: "/icon-192.png", // opaco: iOS rellena de negro la transparencia
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <ToastProvider />
        <Analytics />
      </body>
    </html>
  );
}
