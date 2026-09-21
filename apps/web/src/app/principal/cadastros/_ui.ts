// Classes neutras compartilhadas das telas da Central de Cadastros — SEMPRE seguem o tema
// escolhido pelo assinante em Configurações (nunca fundo/texto fixo em tom escuro). Cada tela
// mantém sua cor de destaque própria (os tons saturados/translúcidos funcionam nos dois temas);
// o que este helper resolve são os fundos, bordas e textos neutros.
//
// Obs.: strings de classe Tailwind precisam aparecer literais no código — por isso nada de
// interpolar o nome da cor.

export function cadastroUI(isDark: boolean) {
  return {
    backLink: `inline-flex items-center gap-2 text-xs font-semibold transition ${
      isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900"
    }`,
    headerCard: `flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 rounded-3xl border shadow-xl ${
      isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-slate-200/50"
    }`,
    title: `text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`,
    subtitle: `text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`,
    toolbar: `flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-4 rounded-2xl border ${
      isDark ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm"
    }`,
    input: `w-full rounded-xl text-xs focus:outline-none transition ${
      isDark
        ? "bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:border-sky-500"
        : "bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-sky-500"
    }`,
    muted: isDark ? "text-slate-400" : "text-slate-600",
    strong: isDark ? "text-white" : "text-slate-900",
    tableCard: `border rounded-3xl overflow-hidden shadow-xl ${
      isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"
    }`,
    thead: `font-mono border-b uppercase tracking-wider ${
      isDark ? "bg-slate-950/80 text-slate-400 border-slate-800" : "bg-slate-100 text-slate-700 border-slate-200"
    }`,
    tdivide: isDark ? "divide-slate-800/60" : "divide-slate-200",
    rowHover: isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50",
    empty: isDark ? "text-slate-500" : "text-slate-400",
    // Botão de ícone neutro (a cor do ícone dentro fica por conta da tela).
    iconBtn: isDark ? "bg-slate-800 hover:brightness-125" : "bg-slate-100 hover:bg-slate-200",
    modalBackdrop: "fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4",
    modalCard: `border rounded-3xl w-full shadow-2xl overflow-hidden ${
      isDark ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"
    }`,
    modalDivider: isDark ? "border-slate-800" : "border-slate-200",
    label: `text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`,
    field: `w-full px-3.5 py-2 rounded-xl text-sm focus:outline-none ${
      isDark ? "bg-slate-950 border border-slate-800 text-white focus:border-sky-500" : "bg-white border border-slate-300 text-slate-900 focus:border-sky-500"
    }`,
    ghostBtn: `px-4 py-2 rounded-lg border text-xs font-semibold transition ${
      isDark ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-100"
    }`,
    page: (bgApp: string, textMain: string) => `min-h-screen p-4 md:p-8 ${bgApp} ${textMain} transition-colors`,
  };
}
