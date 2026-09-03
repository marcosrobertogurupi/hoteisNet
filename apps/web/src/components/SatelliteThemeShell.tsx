"use client";

import { useTheme } from "@/context/ThemeContext";

// Casca visual dos apps satélite (Contagem, Governança): aplica o fundo e a cor de texto do
// tema escolhido pelo assinante. O tema em si é carregado pela própria página (do /me), aqui
// só reagimos ao valor no contexto.
export default function SatelliteThemeShell({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return <div className={`min-h-screen ${theme.bgApp} ${theme.textMain} transition-colors`}>{children}</div>;
}
