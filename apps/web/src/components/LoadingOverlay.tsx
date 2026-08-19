"use client";

import { RefreshCw } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

// Aviso central exibido enquanto uma tela busca seus dados iniciais no servidor — mesmo padrão
// visual usado no Mapa de Quartos, reaproveitado em todas as telas do menu lateral para manter
// o usuário informado do que está acontecendo em segundo plano durante o pequeno delay natural
// da busca no banco de dados.
export default function LoadingOverlay({
  show,
  message = "Carregando dados...",
  submessage = "Estamos buscando as informações mais recentes no servidor.",
}: {
  show: boolean;
  message?: string;
  submessage?: string;
}) {
  const { theme } = useTheme();

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-[2px] animate-in fade-in">
      <div
        className={`flex flex-col items-center gap-3 px-8 py-6 rounded-2xl border shadow-2xl ${
          theme.isDark ? "bg-slate-900 border-slate-700 text-slate-100" : "bg-white border-slate-200 text-slate-800"
        }`}
      >
        <RefreshCw className="w-7 h-7 animate-spin shrink-0" style={{ color: theme.primaryColor }} />
        <div className="text-sm text-center">
          <p className="font-semibold">{message}</p>
          <p className={theme.textMuted}>{submessage}</p>
        </div>
      </div>
    </div>
  );
}
