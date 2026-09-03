import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Contagem de Estoque | HoteisNet",
  description: "App de contagem de estoque por leitura de código de barras",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Contagem",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0f1a",
};

export default function ContagemLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#0a0f1a] text-[#F8FAFC]">{children}</div>;
}
