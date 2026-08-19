"use client";

import { LucideIcon } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

interface EmConstrucaoProps {
  icon: LucideIcon;
  title: string;
  description: string;
  color?: string;
}

export default function EmConstrucao({ icon: Icon, title, description, color }: EmConstrucaoProps) {
  const { theme } = useTheme();
  const iconColor = color || theme.primaryColor;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div
          style={{ backgroundColor: `${iconColor}22` }}
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
        >
          <Icon className="w-5 h-5" style={{ color: iconColor }} />
        </div>
        <div>
          <h1 className={`text-lg font-bold ${theme.textMain}`}>{title}</h1>
          <p className={`text-xs ${theme.textMuted}`}>{description}</p>
        </div>
      </div>

      <div className={`p-10 rounded-2xl border flex flex-col items-center justify-center text-center gap-2 ${theme.bgCard}`}>
        <Icon className="w-10 h-10 mb-1 opacity-30" style={{ color: iconColor }} />
        <span className={`text-sm font-bold ${theme.textMain}`}>Em desenvolvimento</span>
        <span className={`text-xs max-w-md ${theme.textMuted}`}>
          Esta funcionalidade ainda está sendo implementada e estará disponível em breve.
        </span>
      </div>
    </div>
  );
}
