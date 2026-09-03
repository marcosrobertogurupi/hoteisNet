"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, ArrowLeft, Settings2, Receipt, Monitor, Tags } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import ConfigTab from "./_tabs/ConfigTab";
import PerfisTab from "./_tabs/PerfisTab";
import CaixasTab from "./_tabs/CaixasTab";
import CatalogoTab from "./_tabs/CatalogoTab";

// O cadastro de comandas fica só na Central de Cadastros ("Mesas & Comandas").
const TABS = [
  { id: "config", label: "Configuração", icon: Settings2, Comp: ConfigTab },
  { id: "perfis", label: "Perfis Fiscais", icon: Receipt, Comp: PerfisTab },
  { id: "caixas", label: "Caixas", icon: Monitor, Comp: CaixasTab },
  { id: "catalogo", label: "Catálogo", icon: Tags, Comp: CatalogoTab },
] as const;

export default function FiscalPage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const [active, setActive] = useState<(typeof TABS)[number]["id"]>("config");
  const Active = TABS.find((t) => t.id === active)!.Comp;

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgApp} ${theme.textMain} transition-colors`}>
      <div className="max-w-7xl mx-auto space-y-6">
        <Link
          href="/app/cadastros"
          className={`inline-flex items-center gap-2 text-xs font-semibold transition ${
            isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
        </Link>

        <div
          className={`flex items-center gap-4 p-6 rounded-3xl border shadow-xl ${
            isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"
          }`}
        >
          <div
            className={`p-3.5 border rounded-2xl ${
              isDark ? "bg-amber-500/10 border-amber-500/20 text-amber-400" : "bg-amber-50 border-amber-200 text-amber-600"
            }`}
          >
            <FileText className="w-8 h-8" />
          </div>
          <div>
            <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
              Fiscal & PDV do Restaurante
            </h1>
            <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
              Configuração fiscal, perfis tributários, caixas e catálogo para emissão de NFC-e / NF-e.
            </p>
          </div>
        </div>

        <div className={`flex flex-wrap gap-2 border-b ${isDark ? "border-slate-800" : "border-slate-200"}`}>
          {TABS.map((t) => {
            const Icon = t.icon;
            const on = t.id === active;
            return (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition ${
                  on
                    ? "border-sky-500 text-sky-500"
                    : isDark
                      ? "border-transparent text-slate-400 hover:text-slate-200"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="pt-2">
          <Active />
        </div>
      </div>
    </div>
  );
}
