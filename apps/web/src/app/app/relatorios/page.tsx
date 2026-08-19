"use client";

import Link from "next/link";
import { CalendarClock, Sparkles, BedDouble, ChevronRight, FileBarChart } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

const REPORTS = [
  {
    href: "/app/relatorios/reservas-por-periodo",
    title: "Reservas por período",
    description: "Lista as reservas com previsão de chegada para uma data escolhida — quarto, hóspede, telefone, período e ocupantes.",
    icon: CalendarClock,
    color: "#0284C7",
  },
  {
    href: "/app/relatorios/quartos-limpeza",
    title: "Quartos para limpeza",
    description: "Relação de quartos vagos pendentes de higienização, separados por andar, com o total de quartos a limpar.",
    icon: Sparkles,
    color: "#EAB308",
  },
  {
    href: "/app/relatorios/quartos-ocupados",
    title: "Quartos ocupados",
    description: "Relação de quartos ocupados com hóspede, entrada e previsão de saída, somando a quantidade de pessoas no hotel (café da manhã).",
    icon: BedDouble,
    color: "#10B981",
  },
];

export default function RelatoriosHubPage() {
  const { theme } = useTheme();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div
          style={{ backgroundColor: `${theme.primaryColor}22` }}
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
        >
          <FileBarChart className="w-5 h-5" style={{ color: theme.primaryColor }} />
        </div>
        <div>
          <h1 className={`text-lg font-bold ${theme.textMain}`}>Relatórios</h1>
          <p className={`text-xs ${theme.textMuted}`}>Relatórios operacionais para impressão, prontos para a rotina diária da recepção e governança.</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORTS.map((report) => {
          const Icon = report.icon;
          return (
            <Link
              key={report.href}
              href={report.href}
              className={`group p-5 rounded-2xl border transition-all hover:shadow-lg ${theme.bgCard}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  style={{ backgroundColor: `${report.color}22` }}
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                >
                  <Icon className="w-5 h-5" style={{ color: report.color }} />
                </div>
                <ChevronRight className={`w-4 h-4 ${theme.textMuted} group-hover:translate-x-1 transition-transform`} />
              </div>
              <h3 className={`font-bold text-sm mb-1.5 ${theme.textMain}`}>{report.title}</h3>
              <p className={`text-xs leading-relaxed ${theme.textMuted}`}>{report.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
