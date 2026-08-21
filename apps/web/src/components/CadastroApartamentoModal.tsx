"use client";

import { useState, useEffect, useRef } from "react";
import type { ChangeEvent } from "react";
import Link from "next/link";
import { X, BedDouble, Check, Settings2, ImagePlus, Trash2, Eye, Images } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";

const TENANT_ID = "tenant-hoteisnet-demo";

export interface ApartamentoFormData {
  id?: string;
  numero: string;
  categoria: string;
  andar: string;
  bloco: string;
  camasCasal: number;
  camasSolteiro: number;
  caracteristicas: string[];
  fotos: string[];
  status: "LIVRE" | "OCUPADO" | "MANUTENCAO" | "LIMPEZA";
  observacao: string;
}

interface CadastroApartamentoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ApartamentoFormData) => void;
  initialData?: ApartamentoFormData | null;
}

const CARACTERISTICAS_OPCOES = [
  "Ar-Condicionado Split",
  "TV a Cabo / Smart TV",
  "Frigobar Abastecido",
  "Banheira Hidromassagem",
  "Sacada com Vista Mar",
  "Wi-Fi de Alta Velocidade",
  "Cofre Eletrônico",
  "Acessível PCD / Rampa",
  "Secador de Cabelo",
  "Mesa de Trabalho",
];

export default function CadastroApartamentoModal({
  isOpen,
  onClose,
  onSave,
  initialData,
}: CadastroApartamentoModalProps) {
  const toast = useToast();
  const { theme } = useTheme();
  const isDark = theme.isDark;

  const [andares, setAndares] = useState<{ id: string; name: string }[]>([]);
  const [categorias, setCategorias] = useState<{ id: string; name: string }[]>([]);
  const [fotoUploadError, setFotoUploadError] = useState<string | null>(null);
  const [previewFoto, setPreviewFoto] = useState<string | null>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    fetch(`/api/cadastros/andares?tenantId=${TENANT_ID}`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.floors)) {
          setAndares(data.floors.map((f: any) => ({ id: f.id, name: f.name })));
        }
      })
      .catch((err) => console.warn("[CadastroApartamentoModal] Erro ao buscar andares:", err));

    fetch(`/api/cadastros/categorias-apartamento?tenantId=${TENANT_ID}`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.categories)) {
          setCategorias(data.categories.map((c: any) => ({ id: c.id, name: c.name })));
        }
      })
      .catch((err) => console.warn("[CadastroApartamentoModal] Erro ao buscar categorias:", err));
  }, [isOpen]);

  const [formData, setFormData] = useState<ApartamentoFormData>({
    numero: "",
    categoria: "",
    andar: "",
    bloco: "Bloco Principal",
    camasCasal: 1,
    camasSolteiro: 1,
    caracteristicas: ["Ar-Condicionado Split", "TV a Cabo / Smart TV", "Frigobar Abastecido"],
    fotos: [],
    status: "LIVRE",
    observacao: "",
  });

  useEffect(() => {
    if (initialData) {
      setFormData({ fotos: [], ...initialData });
    } else {
      setFormData({
        numero: "",
        categoria: "",
        andar: "",
        bloco: "Bloco Principal",
        camasCasal: 1,
        camasSolteiro: 1,
        caracteristicas: ["Ar-Condicionado Split", "TV a Cabo / Smart TV", "Frigobar Abastecido"],
        fotos: [],
        status: "LIVRE",
        observacao: "",
      });
    }
    setFotoUploadError(null);
    setPreviewFoto(null);
  }, [initialData, isOpen]);

  // Ao carregar as listas de pré-cadastro, seleciona o primeiro item por padrão em
  // novos cadastros que ainda não têm categoria/andar definidos.
  useEffect(() => {
    if (initialData) return;
    setFormData((prev) => ({
      ...prev,
      categoria: prev.categoria || categorias[0]?.name || "",
      andar: prev.andar || andares[0]?.name || "",
    }));
  }, [categorias, andares, initialData]);

  if (!isOpen) return null;

  const toggleCaracteristica = (item: string) => {
    setFormData((prev) => {
      const exists = prev.caracteristicas.includes(item);
      if (exists) {
        return { ...prev, caracteristicas: prev.caracteristicas.filter((c) => c !== item) };
      } else {
        return { ...prev, caracteristicas: [...prev.caracteristicas, item] };
      }
    });
  };

  const ACCEPTED_FOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];
  const MAX_FOTO_SIZE_BYTES = 3 * 1024 * 1024; // 3MB
  const MAX_FOTOS = 12;

  const handleFotoFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setFotoUploadError(null);

    const disponiveis = MAX_FOTOS - formData.fotos.length;
    if (disponiveis <= 0) {
      setFotoUploadError(`Limite de ${MAX_FOTOS} fotos por apartamento atingido.`);
      e.target.value = "";
      return;
    }

    const selecionados = Array.from(files).slice(0, disponiveis);

    selecionados.forEach((file) => {
      if (!ACCEPTED_FOTO_TYPES.includes(file.type)) {
        setFotoUploadError("Formato inválido. Envie imagens PNG, JPEG ou WEBP.");
        return;
      }
      if (file.size > MAX_FOTO_SIZE_BYTES) {
        setFotoUploadError("Uma ou mais imagens excedem o tamanho máximo de 3MB.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setFormData((prev) => ({ ...prev, fotos: [...prev.fotos, reader.result as string] }));
        }
      };
      reader.onerror = () => setFotoUploadError("Não foi possível ler uma das imagens selecionadas.");
      reader.readAsDataURL(file);
    });

    e.target.value = "";
  };

  const handleRemoveFoto = (index: number) => {
    setFormData((prev) => ({ ...prev, fotos: prev.fotos.filter((_, i) => i !== index) }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.numero.trim()) {
      toast.warning("Por favor, preencha o Número da UH / Apartamento.");
      return;
    }
    onSave(formData);
  };

  const inputClass = isDark
    ? "w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
    : "w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-teal-600 shadow-sm";

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className={`border rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh] ${
        isDark ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"
      }`}>
        <div className={`p-6 border-b flex items-center justify-between ${
          isDark ? "border-slate-800 bg-slate-900/90" : "border-slate-200 bg-slate-50/90"
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-3 border rounded-2xl ${
              isDark ? "bg-teal-500/10 border-teal-500/20 text-teal-400" : "bg-teal-50 border-teal-200 text-teal-600"
            }`}>
              <BedDouble className="w-6 h-6" />
            </div>
            <div>
              <h2 className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                {initialData ? "Editar Apartamento / UH" : "Novo Cadastro de Apartamento (UH)"}
              </h2>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Cadastro de Unidades Habitacionais
              </p>
            </div>
          </div>

          <button onClick={onClose} className={`p-2 rounded-xl transition ${
            isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-500 hover:text-slate-900 hover:bg-slate-200"
          }`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                Nº do Quarto / UH <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ex: 101, 202, 305"
                value={formData.numero}
                onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Categoria / Tipo de UH</label>
                <Link
                  href="/app/cadastros/categorias-apartamento"
                  target="_blank"
                  className="text-[10px] font-semibold text-teal-600 dark:text-teal-400 hover:underline inline-flex items-center gap-1"
                >
                  <Settings2 className="w-3 h-3" /> Gerenciar categorias
                </Link>
              </div>
              <select
                value={formData.categoria}
                onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
                className={inputClass}
              >
                {categorias.length === 0 && <option value={formData.categoria}>{formData.categoria || "Nenhuma categoria cadastrada"}</option>}
                {categorias.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Andar</label>
                <Link
                  href="/app/cadastros/andares"
                  target="_blank"
                  className="text-[10px] font-semibold text-teal-600 dark:text-teal-400 hover:underline inline-flex items-center gap-1"
                >
                  <Settings2 className="w-3 h-3" /> Gerenciar
                </Link>
              </div>
              <select
                value={formData.andar}
                onChange={(e) => setFormData({ ...formData, andar: e.target.value })}
                className={inputClass}
              >
                {andares.length === 0 && <option value={formData.andar}>{formData.andar || "Nenhum andar cadastrado"}</option>}
                {andares.map((a) => (
                  <option key={a.id} value={a.name}>{a.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Bloco / Torre</label>
              <input
                type="text"
                placeholder="Ex: Bloco A"
                value={formData.bloco}
                onChange={(e) => setFormData({ ...formData, bloco: e.target.value })}
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Camas de Casal</label>
              <input
                type="number"
                min={0}
                value={formData.camasCasal}
                onChange={(e) => setFormData({ ...formData, camasCasal: parseInt(e.target.value) || 0 })}
                className={`${inputClass} font-mono`}
              />
            </div>

            <div className="space-y-1.5">
              <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Camas de Solteiro</label>
              <input
                type="number"
                min={0}
                value={formData.camasSolteiro}
                onChange={(e) => setFormData({ ...formData, camasSolteiro: parseInt(e.target.value) || 0 })}
                className={`${inputClass} font-mono`}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Status Atual da UH</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
              className={`${inputClass} font-bold`}
            >
              <option value="LIVRE" className="text-emerald-600 font-bold">🟩 Livre & Limpo (Pronto para Check-in)</option>
              <option value="OCUPADO" className="text-rose-600 font-bold">🟥 Ocupado com Hóspede</option>
              <option value="LIMPEZA" className="text-amber-600 font-bold">🟨 Em Limpeza / Higienização</option>
              <option value="MANUTENCAO" className="text-slate-600 font-bold">⬜ Em Manutenção Técnica</option>
            </select>
          </div>

          {/* Característica Checkboxes */}
          <div className={`p-4 rounded-2xl border space-y-3 ${
            isDark ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200"
          }`}>
            <span className="text-xs font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider block">
              Características & Equipamentos
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {CARACTERISTICAS_OPCOES.map((item) => {
                const isChecked = formData.caracteristicas.includes(item);
                return (
                  <label
                    key={item}
                    onClick={() => toggleCaracteristica(item)}
                    className={`flex items-center gap-3 p-2.5 rounded-xl border text-xs font-medium cursor-pointer transition ${
                      isChecked
                        ? isDark ? "bg-teal-500/15 border-teal-500/40 text-teal-300" : "bg-teal-50 border-teal-300 text-teal-800 font-bold"
                        : isDark ? "bg-slate-900 border-slate-800 text-slate-400 hover:text-white" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      className="rounded border-slate-300 text-teal-600 focus:ring-teal-600"
                    />
                    {item}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Galeria de Fotos do Apartamento */}
          <div className={`p-4 rounded-2xl border space-y-3 ${
            isDark ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200"
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider inline-flex items-center gap-1.5">
                <Images className="w-3.5 h-3.5" /> Fotos do Apartamento ({formData.fotos.length}/{MAX_FOTOS})
              </span>
              <button
                type="button"
                onClick={() => fotoInputRef.current?.click()}
                disabled={formData.fotos.length >= MAX_FOTOS}
                className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-bold flex items-center gap-1.5 transition"
              >
                <ImagePlus className="w-3.5 h-3.5" /> Inserir Fotos
              </button>
              <input
                ref={fotoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                onChange={handleFotoFileChange}
                className="hidden"
              />
            </div>

            {fotoUploadError && (
              <p className="text-[11px] text-red-500 font-medium">{fotoUploadError}</p>
            )}

            {formData.fotos.length === 0 ? (
              <div className={`flex flex-col items-center justify-center gap-2 py-8 rounded-xl border border-dashed text-center ${
                isDark ? "border-slate-800 text-slate-500" : "border-slate-300 text-slate-400"
              }`}>
                <Images className="w-6 h-6" />
                <p className="text-[11px]">Nenhuma foto cadastrada para este apartamento.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {formData.fotos.map((foto, idx) => (
                  <div
                    key={idx}
                    className={`relative group rounded-xl overflow-hidden border aspect-square ${
                      isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"
                    }`}
                  >
                    <img src={foto} alt={`Foto ${idx + 1} do apartamento`} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-slate-950/0 group-hover:bg-slate-950/50 transition flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                      <button
                        type="button"
                        title="Visualizar foto"
                        onClick={() => setPreviewFoto(foto)}
                        className="p-2 rounded-lg bg-white/90 text-slate-800 hover:bg-white transition"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title="Excluir foto"
                        onClick={() => handleRemoveFoto(idx)}
                        className="p-2 rounded-lg bg-rose-600/90 text-white hover:bg-rose-600 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Observações Internas</label>
            <textarea
              rows={3}
              placeholder="Instruções de governança, detalhes da suíte..."
              value={formData.observacao}
              onChange={(e) => setFormData({ ...formData, observacao: e.target.value })}
              className={inputClass}
            />
          </div>

          <div className={`pt-4 border-t flex items-center justify-end gap-3 ${
            isDark ? "border-slate-800" : "border-slate-200"
          }`}>
            <button
              type="button"
              onClick={onClose}
              className={`px-5 py-2.5 rounded-xl border text-xs font-semibold transition ${
                isDark ? "border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-100"
              }`}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-teal-600/20 transition"
            >
              <Check className="w-4 h-4" /> Salvar Apartamento
            </button>
          </div>
        </form>
      </div>

      {previewFoto && (
        <div
          className="fixed inset-0 z-[60] bg-slate-950/85 flex items-center justify-center p-6"
          onClick={() => setPreviewFoto(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewFoto(null)}
            className="absolute top-5 right-5 p-2 rounded-xl bg-white/10 text-white hover:bg-white/20 transition"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={previewFoto}
            alt="Visualização da foto do apartamento"
            className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
