"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type ThemeId = "dark" | "light-white" | "light-blue";

// Chaves de localStorage usadas por versões anteriores para guardar credenciais em texto puro.
// Nunca voltar a gravar nada aqui: são apagadas na primeira carga de cada navegador.
const LEGACY_SECRET_KEYS = [
  "hoteisnet_email_host",
  "hoteisnet_email_port",
  "hoteisnet_email_secure",
  "hoteisnet_email_user",
  "hoteisnet_email_pass",
  "hoteisnet_email_from_name",
  "hoteisnet_email_from_address",
  "hoteisnet_email_footer",
  "hoteisnet_email_opt_voucher",
  "hoteisnet_email_opt_receipt",
  "hoteisnet_email_opt_payment",
  "hoteisnet_uazapi_server",
  "hoteisnet_uazapi_token",
];

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  description: string;
  isDark: boolean;
  primaryColor: string;
  accentColor: string;
  bgApp: string;
  bgHeader: string;
  bgSidebar: string;
  bgCard: string;
  borderColor: string;
  textMain: string;
  textMuted: string;
  badgeBg: string;
  previewGradient: string;
}

export const THEMES: Record<ThemeId, ThemeConfig> = {
  dark: {
    id: "dark",
    name: "Dark Moderno (Escuro Tech)",
    description: "Design escuro corporativo com fundo #090D16 e texto claro. Ideal para baixa iluminação.",
    isDark: true,
    primaryColor: "#0284C7",
    accentColor: "#38BDF8",
    bgApp: "bg-[#090D16]",
    bgHeader: "bg-[#0F172A] border-slate-800 text-white",
    bgSidebar: "bg-[#0F172A] border-slate-800 text-white",
    bgCard: "bg-[#0F172A] border-slate-800 text-white",
    borderColor: "border-slate-800",
    textMain: "text-white",
    textMuted: "text-slate-400",
    badgeBg: "bg-[#0284C7]/20 text-[#38BDF8] border-[#0284C7]/40",
    previewGradient: "from-[#0F172A] via-[#1E293B] to-[#0284C7]",
  },
  "light-white": {
    id: "light-white",
    name: "Claro Branco (White Clean)",
    description: "Design claro minimalista: Fundo e sidebar brancos (#FFFFFF) com texto escuro (#0F172A) e máxima legibilidade.",
    isDark: false,
    primaryColor: "#0284C7",
    accentColor: "#0369A1",
    bgApp: "bg-[#F8FAFC]",
    bgHeader: "bg-white border-slate-200 text-slate-900 shadow-sm",
    bgSidebar: "bg-white border-slate-200 text-slate-900 shadow-sm",
    bgCard: "bg-white border-slate-200 text-slate-900 shadow-sm",
    borderColor: "border-slate-200",
    textMain: "text-slate-900",
    textMuted: "text-slate-600",
    badgeBg: "bg-[#0284C7]/15 text-[#0284C7] border-[#0284C7]/30",
    previewGradient: "from-white via-[#E0F2FE] to-[#0284C7]",
  },
  "light-blue": {
    id: "light-blue",
    name: "Claro Foco (Branco & Azul Real)",
    description: "Design executivo FOCO: Fundo claro (#F1F5F9), sidebar em Azul Real (#34598F) e cards brancos com texto escuro.",
    isDark: false,
    primaryColor: "#34598F",
    accentColor: "#F59E0B",
    bgApp: "bg-[#F1F5F9]",
    bgHeader: "bg-white border-slate-200 text-slate-900 shadow-sm",
    bgSidebar: "bg-[#34598F] border-slate-700 text-white shadow-xl",
    bgCard: "bg-white border-slate-200 text-slate-900 shadow-sm",
    borderColor: "border-slate-200",
    textMain: "text-slate-900",
    textMuted: "text-slate-600",
    badgeBg: "bg-[#34598F]/10 text-[#34598F] border-[#34598F]/30",
    previewGradient: "from-[#34598F] via-[#3B629B] to-slate-100",
  },
};

export interface ThemeContextType {
  currentTheme: ThemeId;
  theme: ThemeConfig;
  // persist=false: só aplica localmente (usado pelos apps satélite, que recebem o tema do
  // próprio /me e não têm sessão de admin para gravar em Configurações).
  setTheme: (themeId: ThemeId, persist?: boolean) => void;
  hotelLogo: string | null;
  setHotelLogo: (logoUrl: string | null) => void;
  hotelName: string;
  setHotelName: (name: string) => void;
  showLogoInHeader: boolean;
  setShowLogoInHeader: (val: boolean) => void;
  showLogoInPrint: boolean;
  setShowLogoInPrint: (val: boolean) => void;
  defaultCheckInTime: string;
  setDefaultCheckInTime: (time: string) => void;
  defaultCheckOutTime: string;
  setDefaultCheckOutTime: (time: string) => void;
  // Tolerância (minutos antes do horário padrão de check-in) sem cobrança de chegada antecipada.
  earlyCheckinToleranceMinutes: number;
  // Cobrança padrão pré-selecionada no painel de decisão de chegada (EXTRA_NIGHT | HALF_NIGHT | FIXED_FEE).
  earlyArrivalDefaultCharge: string;
  overnightArrivalDefaultCharge: string;
  earlyCheckinFixedFeeAmount: number;
  whatsappSoundEnabled: boolean;
  setWhatsappSoundEnabled: (val: boolean) => void;
  humanInterventionSoundEnabled: boolean;
  setHumanInterventionSoundEnabled: (val: boolean) => void;
  reservationToleranceHours: number;
  setReservationToleranceHours: (hours: number) => void;

}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [currentTheme, setCurrentThemeState] = useState<ThemeId>("dark");
  const [hotelLogo, setHotelLogoState] = useState<string | null>(null);
  const [hotelName, setHotelNameState] = useState<string>("Pousada Sol & Mar");
  const [showLogoInHeader, setShowLogoInHeaderState] = useState<boolean>(true);
  const [showLogoInPrint, setShowLogoInPrintState] = useState<boolean>(true);
  const [defaultCheckInTime, setDefaultCheckInTimeState] = useState<string>("14:00");
  const [defaultCheckOutTime, setDefaultCheckOutTimeState] = useState<string>("12:00");
  const [earlyCheckinToleranceMinutes, setEarlyCheckinToleranceMinutesState] = useState<number>(60);
  const [earlyArrivalDefaultCharge, setEarlyArrivalDefaultChargeState] = useState<string>("EXTRA_NIGHT");
  const [overnightArrivalDefaultCharge, setOvernightArrivalDefaultChargeState] = useState<string>("EXTRA_NIGHT");
  const [earlyCheckinFixedFeeAmount, setEarlyCheckinFixedFeeAmountState] = useState<number>(0);

  const [whatsappSoundEnabled, setWhatsappSoundEnabledState] = useState<boolean>(true);
  const [humanInterventionSoundEnabled, setHumanInterventionSoundEnabledState] = useState<boolean>(true);

  // Tolerância de Reserva
  const [reservationToleranceHours, setReservationToleranceHoursState] = useState<number>(24);

  // Parâmetros de E-mail / SMTP do Assinante

  // Load from localStorage on mount & sync HTML data-theme
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("hoteisnet_theme") as ThemeId;
      if (savedTheme && THEMES[savedTheme]) {
        setCurrentThemeState(savedTheme);
        if (typeof document !== "undefined") {
          document.documentElement.setAttribute("data-theme", savedTheme);
        }
      } else {
        if (typeof document !== "undefined") {
          document.documentElement.setAttribute("data-theme", "dark");
        }
      }
      const savedLogo = localStorage.getItem("hoteisnet_logo");
      if (savedLogo) setHotelLogoState(savedLogo);

      const savedName = localStorage.getItem("hoteisnet_hotel_name");
      if (savedName) setHotelNameState(savedName);

      const savedHeaderLogo = localStorage.getItem("hoteisnet_header_logo");
      if (savedHeaderLogo !== null) setShowLogoInHeaderState(savedHeaderLogo === "true");

      const savedPrintLogo = localStorage.getItem("hoteisnet_print_logo");
      if (savedPrintLogo !== null) setShowLogoInPrintState(savedPrintLogo === "true");

      const savedCheckIn = localStorage.getItem("hoteisnet_checkin_time");
      if (savedCheckIn) setDefaultCheckInTimeState(savedCheckIn);

      const savedCheckOut = localStorage.getItem("hoteisnet_checkout_time");
      if (savedCheckOut) setDefaultCheckOutTimeState(savedCheckOut);

      const savedWaSound = localStorage.getItem("hoteisnet_wa_sound_enabled");
      if (savedWaSound !== null) setWhatsappSoundEnabledState(savedWaSound === "true");

      const savedEscalationSound = localStorage.getItem("hoteisnet_escalation_sound_enabled");
      if (savedEscalationSound !== null) setHumanInterventionSoundEnabledState(savedEscalationSound === "true");

      const savedTolerance = localStorage.getItem("hoteisnet_reservation_tolerance");
      if (savedTolerance) setReservationToleranceHoursState(Number(savedTolerance));

      // Limpeza única das versões anteriores: a senha do e-mail do hotel e o token da instância
      // de WhatsApp chegaram a ser gravados aqui em texto puro, legíveis por qualquer DevTools,
      // extensão do navegador ou XSS. Hoje essas credenciais vivem só no servidor (EmailSetting /
      // UazapiSetting) — este bloco apaga o que ficou nos navegadores que já rodaram a versão antiga.
      for (const staleKey of LEGACY_SECRET_KEYS) {
        localStorage.removeItem(staleKey);
      }
    } catch (e) {
      console.error("Failed to load theme settings from localStorage", e);
    }
  }, []);

  // Horários padrão e tolerância de chegada antecipada são autoritativos no banco (Tenant) —
  // o localStorage acima é só cache offline até esta busca responder. O backend usa esses mesmos
  // valores para validar a chegada antecipada dentro da transação do check-in.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/tenant/settings")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data?.success || !data.settings) return;
        const s = data.settings;
        // O tema é autoritativo no banco (Tenant.theme) — o localStorage é só cache offline.
        // Assim a escolha do assinante segue entre terminais (antes ficava presa ao navegador).
        if (s.theme && THEMES[s.theme as ThemeId]) {
          setCurrentThemeState(s.theme);
          try {
            localStorage.setItem("hoteisnet_theme", s.theme);
            if (typeof document !== "undefined") document.documentElement.setAttribute("data-theme", s.theme);
          } catch {}
        }
        if (s.standardCheckInTime) {
          setDefaultCheckInTimeState(s.standardCheckInTime);
          try { localStorage.setItem("hoteisnet_checkin_time", s.standardCheckInTime); } catch {}
        }
        if (s.standardCheckOutTime) {
          setDefaultCheckOutTimeState(s.standardCheckOutTime);
          try { localStorage.setItem("hoteisnet_checkout_time", s.standardCheckOutTime); } catch {}
        }
        if (typeof s.earlyCheckinToleranceMinutes === "number") {
          setEarlyCheckinToleranceMinutesState(s.earlyCheckinToleranceMinutes);
        }
        if (s.earlyArrivalDefaultCharge) setEarlyArrivalDefaultChargeState(s.earlyArrivalDefaultCharge);
        if (s.overnightArrivalDefaultCharge) setOvernightArrivalDefaultChargeState(s.overnightArrivalDefaultCharge);
        if (typeof s.earlyCheckinFixedFeeAmount === "number") setEarlyCheckinFixedFeeAmountState(s.earlyCheckinFixedFeeAmount);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const setTheme = (themeId: ThemeId, persist = true) => {
    if (!THEMES[themeId]) return;
    setCurrentThemeState(themeId);
    try {
      localStorage.setItem("hoteisnet_theme", themeId);
      if (typeof document !== "undefined") {
        document.documentElement.setAttribute("data-theme", themeId);
      }
    } catch {}
    if (persist) {
      // Persiste no hotel (Tenant.theme) — só admin; a rota ignora quem não for. Falha de rede
      // não desfaz a troca local (o localStorage segura até a próxima sincronização).
      fetch("/api/tenant/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: themeId }),
      }).catch(() => {});
    }
  };

  const setHotelLogo = (logoUrl: string | null) => {
    setHotelLogoState(logoUrl);
    if (logoUrl) {
      localStorage.setItem("hoteisnet_logo", logoUrl);
    } else {
      localStorage.removeItem("hoteisnet_logo");
    }
  };

  const setHotelName = (name: string) => {
    setHotelNameState(name);
    localStorage.setItem("hoteisnet_hotel_name", name);
  };

  const setShowLogoInHeader = (val: boolean) => {
    setShowLogoInHeaderState(val);
    localStorage.setItem("hoteisnet_header_logo", String(val));
  };

  const setShowLogoInPrint = (val: boolean) => {
    setShowLogoInPrintState(val);
    localStorage.setItem("hoteisnet_print_logo", String(val));
  };

  const setDefaultCheckInTime = (time: string) => {
    setDefaultCheckInTimeState(time);
    localStorage.setItem("hoteisnet_checkin_time", time);
  };

  const setDefaultCheckOutTime = (time: string) => {
    setDefaultCheckOutTimeState(time);
    localStorage.setItem("hoteisnet_checkout_time", time);
  };

  const setWhatsappSoundEnabled = (val: boolean) => {
    setWhatsappSoundEnabledState(val);
    localStorage.setItem("hoteisnet_wa_sound_enabled", String(val));
  };

  const setHumanInterventionSoundEnabled = (val: boolean) => {
    setHumanInterventionSoundEnabledState(val);
    localStorage.setItem("hoteisnet_escalation_sound_enabled", String(val));
  };

  const setReservationToleranceHours = (hours: number) => {
    setReservationToleranceHoursState(hours);
    localStorage.setItem("hoteisnet_reservation_tolerance", String(hours));
  };

  return (
    <ThemeContext.Provider
      value={{
        currentTheme,
        theme: THEMES[currentTheme],
        setTheme,
        hotelLogo,
        setHotelLogo,
        hotelName,
        setHotelName,
        showLogoInHeader,
        setShowLogoInHeader,
        showLogoInPrint,
        setShowLogoInPrint,
        defaultCheckInTime,
        setDefaultCheckInTime,
        defaultCheckOutTime,
        setDefaultCheckOutTime,
        earlyCheckinToleranceMinutes,
        earlyArrivalDefaultCharge,
        overnightArrivalDefaultCharge,
        earlyCheckinFixedFeeAmount,
        whatsappSoundEnabled,
        setWhatsappSoundEnabled,
        humanInterventionSoundEnabled,
        setHumanInterventionSoundEnabled,
        reservationToleranceHours,
        setReservationToleranceHours,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
