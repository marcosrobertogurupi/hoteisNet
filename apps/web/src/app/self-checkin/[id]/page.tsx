"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { UserCheck, Sparkles, FileCheck, Send, CheckCircle2, Building2, Car, Plane, Bus, HeartPulse, Briefcase, GraduationCap, ShoppingCart, Home } from "lucide-react";

export default function SelfCheckinPage() {
  const params = useParams();
  const id = params?.id;
  const [step, setStep] = useState(1);

  // Form Fields for FNRH Legal Exigencies
  const [fullName, setFullName] = useState("Carlos Eduardo Silva");
  const [cpf, setCpf] = useState("123.456.789-00");
  const [birthDate, setBirthDate] = useState("1988-04-12");
  const [phone, setPhone] = useState("(11) 98765-4321");
  const [email, setEmail] = useState("carlos.silva@empresa.com.br");

  // FNRH Legal Fields
  const [travelReason, setTravelReason] = useState("NEGOCIOS");
  const [transportMode, setTransportMode] = useState("AVIAO");
  const [lastOriginCity, setLastOriginCity] = useState("São Paulo");
  const [lastOriginState, setLastOriginState] = useState("SP");
  const [nextDestinationCity, setNextDestinationCity] = useState("Rio de Janeiro");
  const [nextDestinationState, setNextDestinationState] = useState("RJ");
  const [signed, setSigned] = useState(false);
  const [completed, setCompleted] = useState(false);

  const handleComplete = () => {
    setCompleted(true);
  };

  if (completed) {
    return (
      <div className="min-h-screen bg-[#090D16] text-[#F8FAFC] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#10B981]/20 border border-[#10B981]/40 flex items-center justify-center text-[#10B981] mb-4 animate-bounce">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Pré-Checkin & FNRH Confirmados!</h1>
        <p className="text-sm text-slate-400 max-w-sm mb-6">
          Sua Ficha Nacional de Registro de Hóspedes foi assinada e enviada com sucesso à recepção da Pousada Sol & Mar.
        </p>
        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 text-xs text-slate-300 space-y-2 max-w-xs w-full text-left">
          <div className="flex justify-between">
            <span className="text-slate-500">Reserva:</span>
            <span className="font-mono text-white font-semibold">RES-4092</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Acomodação:</span>
            <span className="font-mono text-[#0284C7] font-semibold">Quarto 102 - Luxo Mar</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Protocolo SNRHos:</span>
            <span className="font-mono text-[#10B981]">GOV-894102</span>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-8">Ao chegar na propriedade, apresente apenas um documento com foto.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090D16] text-[#F8FAFC] flex flex-col justify-between p-4 max-w-md mx-auto relative">
      {/* Header Mobile */}
      <header className="py-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#0284C7] flex items-center justify-center text-white font-bold text-sm">
            H
          </div>
          <div>
            <h2 className="text-sm font-bold text-white leading-tight">Pousada Sol & Mar</h2>
            <span className="text-[10px] text-slate-400 block">Pré-Checkin FNRH Digital</span>
          </div>
        </div>
        <span className="text-[10px] font-mono bg-[#10B981]/15 text-[#10B981] px-2 py-0.5 rounded border border-[#10B981]/30">
          Passo {step} de 3
        </span>
      </header>

      {/* Main Form Body */}
      <main className="py-6 space-y-5 flex-1">
        {step === 1 && (
          <div className="space-y-4 animate-fade-in">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-[#0284C7]" />
                1. Confirme seus Dados Pessoais
              </h3>
              <p className="text-xs text-slate-400 mt-1">Preenchimento prévio enviado pela recepção via WhatsApp.</p>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Nome Completo</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-[#0284C7]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">CPF</label>
                  <input
                    type="text"
                    value={cpf}
                    onChange={(e) => setCpf(e.target.value)}
                    className="w-full bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-2.5 font-mono text-white focus:outline-none focus:border-[#0284C7]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Data Nascimento</label>
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-[#0284C7]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-medium">WhatsApp / Telefone</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-2.5 font-mono text-white focus:outline-none focus:border-[#0284C7]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-medium">E-mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-[#0284C7]"
                />
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
                <select
                  value={travelReason}
                  onChange={(e) => setTravelReason(e.target.value)}
                  className="w-full bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-[#F59E0B]"
                >
                  <option value="NEGOCIOS">Negócios / Trabalho</option>
                  <option value="LAZER">Lazer / Férias</option>
                  <option value="CONGRESSO">Congresso / Evento</option>
                  <option value="PARENTES">Visita a Parentes / Amigos</option>
                  <option value="SAUDE">Tratamento de Saúde</option>
                  <option value="ESTUDOS">Estudos / Cursos</option>
                  <option value="OUTROS">Outros Motivos</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Meio de Transporte Utilizado</label>
                <select
                  value={transportMode}
                  onChange={(e) => setTransportMode(e.target.value)}
                  className="w-full bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-[#F59E0B]"
                >
                  <option value="AVIAO">Avião / Aéreo</option>
                  <option value="AUTOMOVEL">Automóvel Próprio / Alugado</option>
                  <option value="ONIBUS">Ônibus Rodoviário</option>
                  <option value="MOTO">Motocicleta</option>
                  <option value="EMBARCACAO">Embarcação / Barco</option>
                  <option value="OUTROS">Outros</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Última Procedência (Cidade)</label>
                  <input
                    type="text"
                    value={lastOriginCity}
                    onChange={(e) => setLastOriginCity(e.target.value)}
                    className="w-full bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-[#F59E0B]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">UF Procedência</label>
                  <input
                    type="text"
                    value={lastOriginState}
                    onChange={(e) => setLastOriginState(e.target.value)}
                    className="w-full bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-[#F59E0B]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Próximo Destino (Cidade)</label>
                  <input
                    type="text"
                    value={nextDestinationCity}
                    onChange={(e) => setNextDestinationCity(e.target.value)}
                    className="w-full bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-[#F59E0B]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">UF Destino</label>
                  <input
                    type="text"
                    value={nextDestinationState}
                    onChange={(e) => setNextDestinationState(e.target.value)}
                    className="w-full bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-[#F59E0B]"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStep(1)}
                className="w-1/3 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-sm rounded-xl transition-colors"
              >
                ← Voltar
              </button>
              <button
                onClick={() => setStep(3)}
                className="w-2/3 py-3 bg-[#F59E0B] hover:bg-[#D97706] text-slate-950 font-bold text-sm rounded-xl transition-colors shadow-lg shadow-[#F59E0B]/20"
              >
                Ir para Assinatura Touch →
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

            {/* Signature Canvas Box Simulator */}
            <div 
              onClick={() => setSigned(true)}
              className={`h-40 rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-4 cursor-pointer transition-all ${
                signed 
                  ? "border-[#10B981] bg-[#10B981]/10" 
                  : "border-slate-700 bg-[#0F172A] hover:border-slate-500"
              }`}
            >
              {signed ? (
                <div className="text-center space-y-1">
                  <span className="font-serif italic text-2xl text-[#10B981] block">Carlos E. Silva</span>
                  <span className="text-[10px] text-[#10B981] font-mono flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Assinatura Digital Registrada
                  </span>
                </div>
              ) : (
                <div className="text-center space-y-1 text-slate-500">
                  <span className="text-xs block">Clique ou desenhe para assinar</span>
                  <span className="text-[10px] block opacity-60">Canvas Touch Ativo</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setStep(2)}
                className="w-1/3 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-sm rounded-xl transition-colors"
              >
                ← Voltar
              </button>
              <button
                onClick={handleComplete}
                disabled={!signed}
                className={`w-2/3 py-3 font-bold text-sm rounded-xl transition-colors shadow-lg ${
                  signed 
                    ? "bg-[#10B981] hover:bg-[#059669] text-white shadow-[#10B981]/20" 
                    : "bg-slate-800 text-slate-500 cursor-not-allowed"
                }`}
              >
                Concluir Pré-Checkin
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer info */}
      <footer className="py-2 border-t border-slate-800/60 text-center text-[10px] text-slate-500">
        Hoteis.Net PMS SaaS • Conformidade SNRHos Ministério do Turismo
      </footer>
    </div>
  );
}
