"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { UserCheck, FileCheck, Sparkles, CheckCircle2, Loader2, AlertCircle, Eraser } from "lucide-react";

// Valores alinhados aos domínios oficiais da API do SNRHos (GET /dominios/fnrh/motivos_viagem e
// /dominios/fnrh/meios_transporte) — enviados sem tradução na Fase 2 (transmissão ao governo).
const TRAVEL_REASONS = [
  { value: "NEGOCIOS", label: "Negócios / Trabalho" },
  { value: "LAZER_FERIAS", label: "Lazer / Férias" },
  { value: "CONGRESSO_FEIRA", label: "Congresso / Feira" },
  { value: "PARENTES_AMIGOS", label: "Visita a Parentes / Amigos" },
  { value: "SAUDE", label: "Tratamento de Saúde" },
  { value: "ESTUDOS_CURSOS", label: "Estudos / Cursos" },
  { value: "COMPRAS", label: "Compras" },
  { value: "RELIGIAO", label: "Religião" },
];

const TRANSPORT_MODES = [
  { value: "AVIAO", label: "Avião / Aéreo" },
  { value: "AUTOMOVEL", label: "Automóvel Próprio / Alugado" },
  { value: "ONIBUS", label: "Ônibus Rodoviário" },
  { value: "MOTO", label: "Motocicleta" },
  { value: "NAVIO_BARCO", label: "Navio / Barco" },
  { value: "TREM", label: "Trem" },
  { value: "BICICLETA", label: "Bicicleta" },
  { value: "PE", label: "A pé" },
];

const RACE_COLOR_OPTIONS = [
  { value: "NAOINFORMAR", label: "Prefiro não informar" },
  { value: "BRANCA", label: "Branca" },
  { value: "PRETA", label: "Preta" },
  { value: "PARDA", label: "Parda" },
  { value: "AMARELA", label: "Amarela" },
  { value: "INDIGENA", label: "Indígena" },
];

const DISABILITY_OPTIONS = [
  { value: "NAOINFORMAR", label: "Prefiro não informar" },
  { value: "NAO", label: "Não" },
  { value: "SIM", label: "Sim" },
];

// Lista curta com os países mais comuns entre hóspedes — não é o catálogo completo ISO
// 3166-1 alpha-2 exigido pela API do SNRHos (PaisNacionalidade_id), mas cobre a grande
// maioria dos casos reais; "Outro" fica como escape hatch para os demais.
const NATIONALITY_OPTIONS = [
  { value: "BR", label: "Brasileira" },
  { value: "AR", label: "Argentina" },
  { value: "US", label: "Norte-americana (EUA)" },
  { value: "PT", label: "Portuguesa" },
  { value: "DE", label: "Alemã" },
  { value: "ES", label: "Espanhola" },
  { value: "FR", label: "Francesa" },
  { value: "IT", label: "Italiana" },
  { value: "UY", label: "Uruguaia" },
  { value: "PY", label: "Paraguaia" },
  { value: "CL", label: "Chilena" },
  { value: "CO", label: "Colombiana" },
  { value: "OUTRO", label: "Outra" },
];

function inputClass(accent: string) {
  return `w-full bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-[${accent}]`;
}

function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  // Ref (não state) para evitar closure desatualizado: finishStroke roda no pointerup, que pode
  // disparar antes de um re-render refletir um setState feito no pointermove imediatamente
  // anterior (gestos rápidos). Quem controla a UI (habilitar o botão "Concluir") é o componente
  // pai, via onChange — este componente não precisa de state próprio.
  const hasStrokeRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#0F172A";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Alguns navegadores/webviews podem não suportar captura de ponteiro nesse contexto —
      // o desenho ainda funciona sem ela, só perde a garantia de receber o pointerup fora do canvas.
    }
    drawingRef.current = true;
    const ctx = canvas.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasStrokeRef.current = true;
  };

  const finishStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas && hasStrokeRef.current) onChange(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    hasStrokeRef.current = false;
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={480}
        height={200}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishStroke}
        onPointerLeave={finishStroke}
        className="w-full h-40 rounded-xl border-2 border-dashed border-slate-700 touch-none bg-white"
      />
      <button
        type="button"
        onClick={clear}
        className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1"
      >
        <Eraser className="w-3 h-3" /> Limpar assinatura
      </button>
    </div>
  );
}

export default function SelfCheckinPage() {
  const params = useParams();
  const token = params?.token as string;

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error" | "already">("loading");
  const [loadError, setLoadError] = useState("");
  const [hotelName, setHotelName] = useState("");
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [completed, setCompleted] = useState(false);

  const [form, setForm] = useState({
    fullName: "",
    cpf: "",
    birthDate: "",
    phone: "",
    email: "",
    gender: "",
    rgNumber: "",
    rgIssuer: "",
    rgIssuerState: "",
    nationality: "BR",
    raceColor: "NAOINFORMAR",
    disability: "NAOINFORMAR",
    occupation: "",
    zipCode: "",
    street: "",
    number: "",
    neighborhood: "",
    city: "",
    state: "",
    travelReason: "NEGOCIOS",
    transportMode: "AVIAO",
    lastOriginCity: "",
    lastOriginState: "",
    nextDestinationCity: "",
    nextDestinationState: "",
  });
  const [signature, setSignature] = useState<string | null>(null);

  const setField = useCallback((key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`/api/public/pre-checkin/${token}`);
        const data = await res.json();

        if (!data.success) {
          setLoadError(data.error || "Não foi possível carregar seu pré-check-in.");
          setLoadState("error");
          return;
        }

        setHotelName(data.hotel?.name || "");

        if (data.alreadyCompleted) {
          setLoadState("already");
          return;
        }

        const g = data.guest || {};
        setForm((prev) => ({
          ...prev,
          fullName: g.fullName || "",
          cpf: g.cpf || "",
          birthDate: g.birthDate ? String(g.birthDate).slice(0, 10) : "",
          phone: g.phone || "",
          email: g.email || "",
          gender: g.gender || "",
          rgNumber: g.rgNumber || "",
          rgIssuer: g.rgIssuer || "",
          rgIssuerState: g.rgIssuerState || "",
          nationality: g.nationality || "BR",
          raceColor: g.raceColor || "NAOINFORMAR",
          disability: g.disability || "NAOINFORMAR",
          occupation: g.occupation || "",
          zipCode: g.zipCode || "",
          street: g.street || "",
          number: g.number || "",
          neighborhood: g.neighborhood || "",
          city: g.city || "",
          state: g.state || "",
        }));
        setLoadState("ready");
      } catch {
        setLoadError("Erro de conexão. Verifique sua internet e tente novamente.");
        setLoadState("error");
      }
    })();
  }, [token]);

  const handleComplete = async () => {
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch(`/api/public/pre-checkin/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, signatureDataUrl: signature }),
      });
      const data = await res.json();
      if (!data.success) {
        setSubmitError(data.error || "Não foi possível concluir seu pré-check-in.");
        setSubmitting(false);
        return;
      }
      setCompleted(true);
    } catch {
      setSubmitError("Erro de conexão. Tente novamente em instantes.");
      setSubmitting(false);
    }
  };

  if (loadState === "loading") {
    return (
      <div className="min-h-screen bg-[#090D16] text-[#F8FAFC] flex flex-col items-center justify-center p-6">
        <Loader2 className="w-8 h-8 animate-spin text-[#0284C7] mb-3" />
        <p className="text-sm text-slate-400">Carregando seu pré-check-in...</p>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="min-h-screen bg-[#090D16] text-[#F8FAFC] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#EF4444]/15 border border-[#EF4444]/30 flex items-center justify-center text-[#EF4444] mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Não foi possível abrir o link</h1>
        <p className="text-sm text-slate-400 max-w-sm">{loadError}</p>
      </div>
    );
  }

  if (loadState === "already") {
    return (
      <div className="min-h-screen bg-[#090D16] text-[#F8FAFC] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#10B981]/20 border border-[#10B981]/40 flex items-center justify-center text-[#10B981] mb-4">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Pré-check-in já confirmado!</h1>
        <p className="text-sm text-slate-400 max-w-sm">
          Seus dados já foram recebidos pela recepção do {hotelName || "hotel"}. Ao chegar, apresente apenas um
          documento com foto.
        </p>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="min-h-screen bg-[#090D16] text-[#F8FAFC] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#10B981]/20 border border-[#10B981]/40 flex items-center justify-center text-[#10B981] mb-4 animate-bounce">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Pré-Checkin Confirmado!</h1>
        <p className="text-sm text-slate-400 max-w-sm mb-6">
          Seus dados foram assinados e enviados com sucesso à recepção do {hotelName || "hotel"}.
        </p>
        <p className="text-xs text-slate-500 mt-2">Ao chegar na propriedade, apresente apenas um documento com foto.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090D16] text-[#F8FAFC] flex flex-col justify-between p-4 max-w-md mx-auto relative">
      <header className="py-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#0284C7] flex items-center justify-center text-white font-bold text-sm">
            H
          </div>
          <div>
            <h2 className="text-sm font-bold text-white leading-tight">{hotelName || "Hoteis.Net"}</h2>
            <span className="text-[10px] text-slate-400 block">Pré-Checkin FNRH Digital</span>
          </div>
        </div>
        <span className="text-[10px] font-mono bg-[#10B981]/15 text-[#10B981] px-2 py-0.5 rounded border border-[#10B981]/30">
          Passo {step} de 3
        </span>
      </header>

      <main className="py-6 space-y-5 flex-1">
        {step === 1 && (
          <div className="space-y-4 animate-fade-in">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-[#0284C7]" />
                1. Confirme seus Dados
              </h3>
              <p className="text-xs text-slate-400 mt-1">Preenchimento prévio enviado pela recepção via WhatsApp.</p>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Nome Completo</label>
                <input className={inputClass("#0284C7")} value={form.fullName} onChange={(e) => setField("fullName", e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">CPF</label>
                  <input className={`${inputClass("#0284C7")} font-mono`} value={form.cpf} onChange={(e) => setField("cpf", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Data Nascimento</label>
                  <input type="date" className={inputClass("#0284C7")} value={form.birthDate} onChange={(e) => setField("birthDate", e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">WhatsApp / Telefone</label>
                  <input className={`${inputClass("#0284C7")} font-mono`} value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">E-mail</label>
                  <input type="email" className={inputClass("#0284C7")} value={form.email} onChange={(e) => setField("email", e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">RG / Identidade</label>
                  <input className={inputClass("#0284C7")} value={form.rgNumber} onChange={(e) => setField("rgNumber", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Órgão Expedidor / UF</label>
                  <div className="flex gap-1">
                    <input className={inputClass("#0284C7")} placeholder="SSP" value={form.rgIssuer} onChange={(e) => setField("rgIssuer", e.target.value)} />
                    <input className={`${inputClass("#0284C7")} w-16`} placeholder="UF" maxLength={2} value={form.rgIssuerState} onChange={(e) => setField("rgIssuerState", e.target.value.toUpperCase())} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Nacionalidade</label>
                  <select className={inputClass("#0284C7")} value={form.nationality} onChange={(e) => setField("nationality", e.target.value)}>
                    {NATIONALITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Profissão</label>
                  <input className={inputClass("#0284C7")} value={form.occupation} onChange={(e) => setField("occupation", e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Sexo</label>
                  <select className={inputClass("#0284C7")} value={form.gender} onChange={(e) => setField("gender", e.target.value)}>
                    <option value="">Selecione</option>
                    <option value="Masculino">Masculino</option>
                    <option value="Feminino">Feminino</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Raça/Cor</label>
                  <select className={inputClass("#0284C7")} value={form.raceColor} onChange={(e) => setField("raceColor", e.target.value)}>
                    {RACE_COLOR_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Possui alguma deficiência?</label>
                <select className={inputClass("#0284C7")} value={form.disability} onChange={(e) => setField("disability", e.target.value)}>
                  {DISABILITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={() => setStep(2)}
              className="w-full py-3 bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold text-sm rounded-xl transition-colors shadow-lg shadow-[#0284C7]/20"
            >
              Continuar para FNRH Legal →
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 animate-fade-in">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-[#F59E0B]" />
                2. Exigências da FNRH (Lei 11.771/08)
              </h3>
              <p className="text-xs text-slate-400 mt-1">Exigência legal do Ministério do Turismo / SNRHos.</p>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Motivo Principal da Viagem</label>
                <select className={inputClass("#F59E0B")} value={form.travelReason} onChange={(e) => setField("travelReason", e.target.value)}>
                  {TRAVEL_REASONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Meio de Transporte Utilizado</label>
                <select className={inputClass("#F59E0B")} value={form.transportMode} onChange={(e) => setField("transportMode", e.target.value)}>
                  {TRANSPORT_MODES.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Última Procedência (Cidade)</label>
                  <input className={inputClass("#F59E0B")} value={form.lastOriginCity} onChange={(e) => setField("lastOriginCity", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">UF Procedência</label>
                  <input className={inputClass("#F59E0B")} maxLength={2} value={form.lastOriginState} onChange={(e) => setField("lastOriginState", e.target.value.toUpperCase())} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Próximo Destino (Cidade)</label>
                  <input className={inputClass("#F59E0B")} value={form.nextDestinationCity} onChange={(e) => setField("nextDestinationCity", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">UF Destino</label>
                  <input className={inputClass("#F59E0B")} maxLength={2} value={form.nextDestinationState} onChange={(e) => setField("nextDestinationState", e.target.value.toUpperCase())} />
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="w-1/3 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-sm rounded-xl transition-colors">
                ← Voltar
              </button>
              <button onClick={() => setStep(3)} className="w-2/3 py-3 bg-[#F59E0B] hover:bg-[#D97706] text-slate-950 font-bold text-sm rounded-xl transition-colors shadow-lg shadow-[#F59E0B]/20">
                Ir para Assinatura →
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 animate-fade-in">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#10B981]" />
                3. Assinatura Eletrônica Touch
              </h3>
              <p className="text-xs text-slate-400 mt-1">Assine com o dedo no retângulo abaixo para validar a FNRH.</p>
            </div>

            <SignaturePad onChange={setSignature} />

            {submitError && (
              <p className="text-[#EF4444] text-xs flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> {submitError}
              </p>
            )}

            <div className="flex gap-2 pt-2">
              <button onClick={() => setStep(2)} className="w-1/3 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-sm rounded-xl transition-colors">
                ← Voltar
              </button>
              <button
                onClick={handleComplete}
                disabled={!signature || submitting}
                className={`w-2/3 py-3 font-bold text-sm rounded-xl transition-colors shadow-lg flex items-center justify-center gap-2 ${
                  signature && !submitting
                    ? "bg-[#10B981] hover:bg-[#059669] text-white shadow-[#10B981]/20"
                    : "bg-slate-800 text-slate-500 cursor-not-allowed"
                }`}
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? "Enviando..." : "Concluir Pré-Checkin"}
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="py-2 border-t border-slate-800/60 text-center text-[10px] text-slate-500">
        Hoteis.Net PMS SaaS • Conformidade SNRHos Ministério do Turismo
      </footer>
    </div>
  );
}
