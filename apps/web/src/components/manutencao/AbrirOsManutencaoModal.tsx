"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Wrench, X, Loader2, Check, AlertTriangle } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";

// Abertura de uma OS de manutenção pelo Mapa de Quartos: a recepção escolhe o tipo de problema,
// descreve, escolhe o colaborador de manutenção e (opcional) a previsão de liberação. O servidor
// (POST /api/manutencao/os) revalida tudo, coloca o quarto em manutenção e o worker avisa o
// colaborador pelo WhatsApp.

interface Option {
  id: string;
  name: string;
}

export interface AbrirOsManutencaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: { id: string; number: string; category: string } | null;
  onOpened?: () => void;
}

export default function AbrirOsManutencaoModal({ isOpen, onClose, room, onOpened }: AbrirOsManutencaoModalProps) {
  const { theme } = useTheme();
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problemTypes, setProblemTypes] = useState<Option[]>([]);
  const [employees, setEmployees] = useState<Option[]>([]);
  const [problemTypeId, setProblemTypeId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [description, setDescription] = useState("");
  const [forecast, setForecast] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setProblemTypeId("");
    setEmployeeId("");
    setDescription("");
    setForecast("");
    setLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/manutencao/opcoes");
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        setProblemTypes(data.problemTypes || []);
        setEmployees(data.employees || []);
        if (data.employees?.length === 1) setEmployeeId(data.employees[0].id);
      } catch {
        toast.error("Não foi possível carregar os tipos de problema e os colaboradores.", "Manutenção");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, room?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, saving, onClose]);

  if (!isOpen || !room) return null;

  const handleSubmit = async () => {
    if (saving) return;
    if (!problemTypeId) return toast.warning("Escolha o tipo de problema.", "Campo obrigatório");
    if (!description.trim()) return toast.warning("Descreva o problema do quarto.", "Campo obrigatório");
    if (!employeeId) return toast.warning("Escolha o colaborador de manutenção.", "Campo obrigatório");

    setSaving(true);
    try {
      const res = await fetch("/api/manutencao/os", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: room.id,
          problemTypeId,
          description,
          assignedEmployeeId: employeeId,
          expectedReleaseAt: forecast || null,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Não foi possível abrir a OS.");
      const employeeName = employees.find((e) => e.id === employeeId)?.name || "o colaborador";
      toast.success(
        `Quarto ${room.number} em manutenção. ${employeeName} será avisado pelo WhatsApp.`,
        `OS nº ${data.ticket.number} aberta`,
      );
      onOpened?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Não foi possível abrir a OS.", "Manutenção");
    } finally {
      setSaving(false);
    }
  };

  const field = `w-full rounded-lg border px-3 py-2 text-xs outline-none ${
    theme.isDark
      ? "bg-slate-900 border-slate-700 text-white focus:border-amber-400"
      : "bg-white border-slate-300 text-slate-900 focus:border-amber-500"
  }`;
  const label = `block font-semibold mb-1 text-[11px] ${theme.isDark ? "text-slate-300" : "text-slate-700"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div
        className={`w-full max-w-lg rounded-xl border shadow-2xl overflow-hidden flex flex-col my-auto ${
          theme.isDark ? "bg-[#0F172A] border-slate-800 text-white" : "bg-[#F4F6F9] border-slate-300 text-slate-900"
        }`}
      >
        <div className="bg-gradient-to-r from-rose-800 via-rose-700 to-amber-600 px-4 py-2.5 flex items-center justify-between text-white shadow-md select-none">
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-amber-100" />
            <h2 className="font-bold text-sm tracking-wide">Abrir OS de manutenção • Quarto {room.number}</h2>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1 rounded-lg hover:bg-white/20 transition-colors text-white disabled:opacity-50"
            title="Fechar (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          <p className={theme.isDark ? "text-slate-400" : "text-slate-600"}>
            O quarto sai de venda e fica em manutenção até o colaborador resolver o problema. Só ele avança as etapas
            da OS; a data e a hora de entrada ficam registradas.
          </p>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
            </div>
          ) : employees.length === 0 ? (
            <div
              className={`flex items-start gap-2 rounded-lg border px-3 py-3 text-[11px] font-semibold ${
                theme.isDark ? "bg-amber-950/40 border-amber-800 text-amber-300" : "bg-amber-50 border-amber-300 text-amber-800"
              }`}
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Nenhum colaborador de manutenção cadastrado. Em{" "}
                <Link href="/principal/cadastros/colaboradores" className="underline">
                  Central de Cadastros → Colaboradores
                </Link>
                , marque &quot;Atende manutenção de quartos&quot; e informe o WhatsApp dele.
              </span>
            </div>
          ) : (
            <>
              <div>
                <label className={label}>
                  Tipo de problema <span className="text-rose-500">*</span>
                </label>
                <select value={problemTypeId} onChange={(e) => setProblemTypeId(e.target.value)} className={field}>
                  <option value="">Selecione…</option>
                  {problemTypes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={label}>
                  O que aconteceu <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={description}
                  maxLength={500}
                  rows={3}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: O chuveiro queimou"
                  className={`${field} resize-none`}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={label}>
                    Colaborador de manutenção <span className="text-rose-500">*</span>
                  </label>
                  <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={field}>
                    <option value="">Selecione…</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label}>Previsão de liberação (opcional)</label>
                  <input
                    type="datetime-local"
                    value={forecast}
                    onChange={(e) => setForecast(e.target.value)}
                    className={field}
                  />
                </div>
              </div>
              <p className={`text-[10px] ${theme.isDark ? "text-slate-500" : "text-slate-500"}`}>
                Sem previsão, o quarto fica fora de venda só para chegadas de hoje. Com previsão, até a data prevista.
              </p>
            </>
          )}
        </div>

        <div className={`px-4 py-3 border-t flex items-center justify-end gap-2 ${theme.isDark ? "border-slate-800" : "border-slate-300"}`}>
          <button
            onClick={onClose}
            disabled={saving}
            className={`px-4 py-2 rounded-lg border text-xs font-semibold transition disabled:opacity-50 ${
              theme.isDark ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-100"
            }`}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || loading || employees.length === 0}
            className="px-4 py-2 rounded-lg bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Abrir OS
          </button>
        </div>
      </div>
    </div>
  );
}
