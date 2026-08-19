import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/context/ThemeContext";
import { ToastProvider } from "@/context/ToastContext";
import { OperatorProvider } from "@/context/OperatorContext";
import { ConfirmProvider } from "@/context/ConfirmContext";
import { PromptProvider } from "@/context/PromptContext";
import { SessionProvider } from "@/context/SessionContext";

export const metadata: Metadata = {
  title: "Hoteis.Net PMS SaaS | Gestão Hoteleira Inteligente",
  description: "Plataforma SaaS para Gestão de Hotéis, Pousadas, Reservas, FNRH Digital e Atendimento WhatsApp com IA.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased bg-[#090D16] text-[#F8FAFC] min-h-screen">
        <ThemeProvider>
          <ToastProvider>
            <ConfirmProvider>
              <PromptProvider>
                <SessionProvider>
                  <OperatorProvider>
                    {children}
                  </OperatorProvider>
                </SessionProvider>
              </PromptProvider>
            </ConfirmProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

