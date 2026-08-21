import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Governança | HoteisNet",
  description: "App de governança de quartos para limpeza",
  manifest: "/housekeeping-manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Governança",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#090D16",
};

export default function HousekeepingLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#090D16] text-[#F8FAFC]">{children}</div>;
}
