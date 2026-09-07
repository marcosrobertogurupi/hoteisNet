import type { Metadata, Viewport } from "next";
import PwaRegister from "@/components/PwaRegister";
import SatelliteThemeShell from "@/components/SatelliteThemeShell";
import AppVersionGate from "@/components/AppVersionGate";

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
    icon: "/brand/icon-192.png",
    apple: "/brand/icon-192.png",
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
      {/* Captura o beforeinstallprompt antes do React hidratar — senão o evento se perde e o
          botão "Instalar app" nunca aparece no Android. Lido em PwaInstallButton via window.__bipEvent. */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__bipEvent=e;});" +
            "window.addEventListener('appinstalled',function(){window.__bipEvent=null;});",
        }}
      />
      <PwaRegister src="/sw-contagem.js" scope="/contagem" />
      <AppVersionGate variant="satellite" />
      {children}
    </SatelliteThemeShell>
  );
}
