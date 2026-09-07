import type { Metadata, Viewport } from "next";
import PwaRegister from "@/components/PwaRegister";
import SatelliteThemeShell from "@/components/SatelliteThemeShell";
import AppVersionGate from "@/components/AppVersionGate";

export const metadata: Metadata = {
  title: "Governança | HoteisNet",
  description: "App de governança de quartos para limpeza",
  manifest: "/housekeeping-manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Governança",
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
  themeColor: "#090D16",
};

export default function HousekeepingLayout({ children }: { children: React.ReactNode }) {
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
      <PwaRegister src="/sw-housekeeping.js" scope="/housekeeping" />
      <AppVersionGate variant="satellite" />
      {children}
    </SatelliteThemeShell>
  );
}
