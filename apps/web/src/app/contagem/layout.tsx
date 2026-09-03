import type { Metadata, Viewport } from "next";
import PwaRegister from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "Contagem de Estoque | HoteisNet",
  description: "App de contagem de estoque por leitura de código de barras",
  manifest: "/contagem-manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Contagem",
  },
  icons: {
    icon: "/brand/icon.png",
    apple: "/brand/icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0f1a",
};

export default function ContagemLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0f1a] text-[#F8FAFC]">
      <PwaRegister src="/sw-contagem.js" scope="/contagem" />
      {children}
    </div>
  );
}
