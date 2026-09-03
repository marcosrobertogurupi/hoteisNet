// Pares de classe claro/escuro para os apps satélite mobile (Contagem de Estoque, Governança).
// Eles seguem o tema escolhido pelo assinante em Configurações (ver memória
// all-tenant-screens-follow-selected-theme). O que os tokens de `useTheme()` já resolvem bem
// (bgApp, bgCard, textMuted, borderColor) deve ser usado direto; este helper cobre só o que
// falta num app mobile: barra fixa de topo/rodapé, campos de formulário, folhas (bottom sheets)
// e superfícies "sutis". Tailwind não enxerga classes interpoladas nem a variante `dark:`
// funciona de forma confiável aqui (o <html> tem `class="dark"` sempre), então tudo é literal
// e o claro/escuro sai de `isDark`.
//
// `accent` = cor de destaque do app (emerald na Contagem, rose na Governança).
export function satelliteAppUI(isDark: boolean, accent: "emerald" | "rose" = "emerald") {
  return {
    bar: isDark ? "bg-[#0a0f1a]/95 border-slate-800" : "bg-white/95 border-slate-200",
    card: isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-sm",
    cardSubtle: isDark ? "bg-slate-900/50 border-slate-800/60" : "bg-slate-50 border-slate-200",
    field: isDark
      ? "bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500"
      : "bg-white border-slate-300 text-slate-900 placeholder-slate-400",
    sheet: isDark ? "bg-[#0e1524] border-slate-800" : "bg-white border-slate-200",
    divider: isDark ? "border-slate-800" : "border-slate-200",
    iconBtn: isDark
      ? "bg-slate-900 border-slate-800 text-slate-400"
      : "bg-slate-100 border-slate-200 text-slate-500",
    chip: isDark ? "bg-slate-950 border-slate-700 text-slate-100" : "bg-slate-100 border-slate-200 text-slate-800",
    faint: isDark ? "text-slate-500" : "text-slate-400",
    // Texto na cor de destaque, legível no tema atual.
    accentText:
      accent === "rose"
        ? isDark
          ? "text-rose-400"
          : "text-rose-600"
        : isDark
          ? "text-emerald-400"
          : "text-emerald-600",
  };
}
