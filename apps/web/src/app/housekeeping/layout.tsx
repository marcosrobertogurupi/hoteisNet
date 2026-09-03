import type { Metadata, Viewport } from "next";
import PwaRegister from "@/components/PwaRegister";
import SatelliteThemeShell from "@/components/SatelliteThemeShell";

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
    icon: "/brand/icon.png",
    apple: "/brand/icon.png",
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
      <PwaRegister src="/sw-housekeeping.js" scope="/housekeeping" />
      {children}
    </SatelliteThemeShell>
  );
}
