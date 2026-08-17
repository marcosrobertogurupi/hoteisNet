"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  CalendarDays, 
  BedDouble, 
  Users, 
  Package, 
  ShoppingBag, 
  CreditCard, 
  DollarSign, 
  FileText, 
  LifeBuoy, 
  LogOut,
  ChevronRight,
  Pin,
  PinOff,
  Settings,
  FolderKanban
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useOperator } from "@/context/OperatorContext";
import { useSession } from "@/context/SessionContext";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  TENANT_ADMIN: "Administrador",
  RECEPCIONIST: "Recepção",
  GOVERNESS: "Governança",
  FINANCIAL: "Financeiro",
};

export default function Sidebar() {
  const pathname = usePathname();
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const { theme, hotelLogo, hotelName, showLogoInHeader } = useTheme();
  const { setOperator } = useOperator();
  const { user, logout } = useSession();

  // O operador ativo (usado nos lançamentos de caixa) passa a ser sempre o usuário
  // realmente logado — não é mais um nome livre digitado sem verificação.
  useEffect(() => {
    if (user) setOperator(user.id, user.name);
  }, [user, setOperator]);

  const displayName = user?.name || "Carregando...";
  const roleLabel = user ? (ROLE_LABELS[user.role] || user.role) : "";

  const operatorInitials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join("")
    .toUpperCase() || "OP";

  const isExpanded = isPinned || isHovered;
  const isSidebarLight = theme.bgSidebar.includes("bg-white") || theme.bgSidebar.includes("bg-slate-50");

  const navItems = [
    { href: "/app", label: "Mapa de Quartos", icon: CalendarDays },
    { href: "/app/cadastros", label: "Central de Cadastros", icon: FolderKanban, iconColor: isSidebarLight ? "text-indigo-600" : "text-[#8B5CF6]" },
    { href: "/app/governance", label: "Governança & Quartos", icon: BedDouble },
    { href: "/app/reservations", label: "Mapa de reservas", icon: Users },
    { href: "/app/stock", label: "Estoque Multi-PDV", icon: Package },
    { href: "/app/consumption", label: "PDV & Consumo", icon: ShoppingBag },
    { href: "/app/checkout", label: "Checkout & Faturamento", icon: CreditCard, iconColor: isSidebarLight ? "text-emerald-600" : "text-[#10B981]" },
    { href: "/app/cash-register", label: "Caixa & Movimentação", icon: DollarSign, iconColor: isSidebarLight ? "text-amber-600" : "text-[#F59E0B]" },
    { href: "/app/fiscal", label: "Módulo Fiscal NFSe/NFCe", icon: FileText, iconColor: isSidebarLight ? "text-cyan-600" : "text-[#38BDF8]" },
    { href: "/app/settings", label: "Configurações & Logo", icon: Settings, iconColor: isSidebarLight ? "text-amber-600" : "text-[#F59E0B]" },
  ];

  return (
    <>
      {/* Spacer to maintain layout flow when sidebar is floating */}
      <div className={`transition-all duration-300 ease-in-out shrink-0 print:hidden ${isPinned ? "w-64" : "w-16"}`} />

      {/* Retractable Sidebar */}
      <aside
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocus={() => setIsHovered(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) {
            setIsHovered(false);
          }
        }}
        className={`fixed top-0 left-0 bottom-0 z-40 border-r flex flex-col justify-between p-3 transition-all duration-300 ease-in-out shadow-2xl print:hidden ${theme.bgSidebar}`}
        style={{ width: isExpanded ? "16rem" : "4rem" }}
      >
        <div className="space-y-6">
          {/* Header & Brand Logo */}
          <div className="flex items-center justify-between px-1 py-1">
            <div className="flex items-center gap-3 overflow-hidden">
              {showLogoInHeader && hotelLogo ? (
                <img 
                  src={hotelLogo} 
                  alt={hotelName} 
                  className="w-10 h-10 rounded-xl object-contain bg-white/10 p-1 border border-slate-700 shrink-0 shadow-lg"
                />
              ) : (
                <div 
                  style={{ backgroundColor: theme.primaryColor }}
                  className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-lg shrink-0"
                >
                  {hotelName ? hotelName.charAt(0) : "H"}
                </div>
              )}

              <div className={`transition-opacity duration-200 overflow-hidden ${isExpanded ? "opacity-100 w-auto" : "opacity-0 w-0 pointer-events-none"}`}>
                <span className={`font-bold text-sm tracking-tight block truncate ${
                  isSidebarLight ? "text-slate-900" : "text-white"
                }`}>
                  {hotelName}
                </span>
                <span className="text-[10px] font-mono text-[#10B981] bg-[#10B981]/15 px-1.5 py-0.5 rounded border border-[#10B981]/30 inline-block whitespace-nowrap">
                  Plano Pro (SaaS)
                </span>
              </div>
            </div>

            {/* Pin Toggle Button (visible when expanded) */}
            {isExpanded && (
              <button
                onClick={() => setIsPinned(!isPinned)}
                title={isPinned ? "Desafixar Menu (Auto-retrátil)" : "Fixar Menu"}
                className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                  isSidebarLight 
                    ? "text-slate-600 hover:text-slate-900 hover:bg-slate-200" 
                    : "text-slate-300 hover:text-white hover:bg-white/10"
                }`}
              >
                {isPinned ? <PinOff className="w-4 h-4 text-[#0284C7]" /> : <Pin className="w-4 h-4" />}
              </button>
            )}
          </div>

          {/* Indicator when collapsed */}
          {!isExpanded && (
            <div className="flex justify-center -my-2">
              <div className="w-full h-px bg-slate-500/30 my-1" />
            </div>
          )}

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                    isActive
                      ? isSidebarLight
                        ? "bg-[#0284C7] text-white font-bold shadow-md"
                        : theme.isDark 
                          ? "bg-[#0284C7] text-white font-bold shadow-md"
                          : "bg-white text-[#34598F] font-bold shadow-md"
                      : isSidebarLight
                        ? "text-slate-700 hover:text-slate-900 hover:bg-slate-100 font-medium"
                        : "text-slate-100 hover:text-white hover:bg-white/15 font-medium"
                  }`}
                  title={!isExpanded ? item.label : undefined}
                >
                  <Icon className={`w-5 h-5 shrink-0 ${item.iconColor ? item.iconColor : isActive ? (isSidebarLight ? "text-white" : theme.isDark ? "text-white" : "text-[#34598F]") : ""}`} />
                  
                  <span className={`transition-all duration-200 whitespace-nowrap overflow-hidden ${
                    isExpanded ? "opacity-100 max-w-xs" : "opacity-0 max-w-0"
                  }`}>
                    {item.label}
                  </span>

                  {/* Tooltip on collapsed hover */}
                  {!isExpanded && (
                    <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg shadow-xl border border-slate-700 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                      {item.label}
                    </div>
                  )}
                </Link>
              );
            })}

            {/* Section Divider & Support */}
            <div className="pt-3 border-t border-slate-500/30 my-2">
              <span className={`px-3 text-[10px] font-bold uppercase tracking-wider block mb-1.5 transition-all ${
                isSidebarLight ? "text-slate-500" : "text-slate-200/80"
              } ${
                isExpanded ? "opacity-100 max-h-5" : "opacity-0 max-h-0 overflow-hidden"
              }`}>
                Suporte & IA
              </span>
              
              <Link
                href="/app/support"
                className={`relative flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                  pathname === "/app/support"
                    ? isSidebarLight
                      ? "bg-[#0284C7] text-white font-bold shadow-md"
                      : "bg-white text-[#34598F] font-bold shadow-md"
                    : isSidebarLight
                      ? "text-slate-700 hover:text-slate-900 hover:bg-slate-100 font-medium"
                      : "text-slate-100 hover:text-white hover:bg-white/15 font-medium"
                }`}
                title={!isExpanded ? "Aba de Suporte (IA)" : undefined}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <LifeBuoy className="w-5 h-5 text-[#F59E0B] shrink-0" />
                  <span className={`transition-all duration-200 whitespace-nowrap overflow-hidden ${
                    isExpanded ? "opacity-100 max-w-xs" : "opacity-0 max-w-0"
                  }`}>
                    Aba de Suporte (IA)
                  </span>
                </div>
                <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] animate-pulse shrink-0" />

                {/* Tooltip on collapsed hover */}
                {!isExpanded && (
                  <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg shadow-xl border border-slate-700 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                    Aba de Suporte (IA)
                  </div>
                )}
              </Link>
            </div>
          </nav>
        </div>

        {/* User Profile & Logout */}
        <div className="pt-3 border-t border-slate-500/30 flex items-center justify-between">
          <div
            title="Usuário autenticado neste terminal"
            className="flex items-center gap-3 overflow-hidden text-left rounded-lg p-1 -m-1"
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 shadow-inner ${
              isSidebarLight ? "bg-slate-200 text-slate-900" : "bg-white/20 text-white"
            }`}>
              {operatorInitials}
            </div>
            <div className={`transition-all duration-200 overflow-hidden ${isExpanded ? "opacity-100 w-auto" : "opacity-0 w-0 pointer-events-none"}`}>
              <span className={`text-xs font-bold block truncate ${
                isSidebarLight ? "text-slate-900" : "text-white"
              }`}>{displayName}</span>
              <span className={`text-[10px] block truncate ${
                isSidebarLight ? "text-slate-500" : "text-slate-200"
              }`}>{roleLabel}</span>
            </div>
          </div>
          {isExpanded && (
            <button
              type="button"
              onClick={logout}
              className={`p-2 rounded-lg transition-colors shrink-0 ${
                isSidebarLight
                  ? "text-slate-600 hover:text-red-600 hover:bg-slate-200"
                  : "text-slate-200 hover:text-red-300 hover:bg-white/15"
              }`}
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
