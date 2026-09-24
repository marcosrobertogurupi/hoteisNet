import type { Metadata, Viewport } from "next";
import PwaRegister from "@/components/PwaRegister";
import SatelliteThemeShell from "@/components/SatelliteThemeShell";
import AppVersionGate from "@/components/AppVersionGate";

export const metadata: Metadata = {
  title: "Manutenção | HoteisNet",
  description: "App do colaborador de manutenção de quartos",
  manifest: "/manutencao-manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Manutenção",
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

export default function ManutencaoLayout({ children }: { children: React.ReactNode }) {
  return (
    <SatelliteThemeShell>
      {/* Captura o beforeinstallprompt antes do React hidratar (ver layout da Contagem). */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__bipEvent=e;});" +
            "window.addEventListener('appinstalled',function(){window.__bipEvent=null;});",
        }}
      />
      <PwaRegister src="/sw-manutencao.js" scope="/manutencao" />
      <AppVersionGate variant="satellite" />
      {children}
    </SatelliteThemeShell>
  );
}
