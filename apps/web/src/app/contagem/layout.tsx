import type { Metadata, Viewport } from "next";
import PwaRegister from "@/components/PwaRegister";
import SatelliteThemeShell from "@/components/SatelliteThemeShell";

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
    <SatelliteThemeShell>
      <PwaRegister src="/sw-contagem.js" scope="/contagem" />
      {children}
    </SatelliteThemeShell>
  );
}
