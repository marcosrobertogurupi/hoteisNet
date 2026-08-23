"use client";

import { useState, useEffect } from "react";
import { 
  X, 
  User, 
  Phone, 
  Mail, 
  Car, 
  Building2, 
  MapPin, 
  FileText, 
  Plus, 
  Trash2, 
  Check,
  AlertCircle,
  Search,
  Loader2,
  CheckCircle2,
  Globe,
  History,
  DoorOpen,
  Eye,
  Printer,
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { ImprimirExtratoHospedagemModal, ExtratoRoomData } from "@/components/ImprimirExtratoHospedagemModal";
import { ImprimirResumoHospedagemModal, ResumoRoomData } from "@/components/ImprimirResumoHospedagemModal";

// Converte um ISO/timestamp do banco para "DD/MM/YYYY HH:MM:SS", formato usado nos modais de Extrato/Resumo.
function formatBrDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export interface TelefoneItem {
  id?: string;
  telefone: string;
  descricao: string;
  telPrincipal: boolean;
}

export interface EmailItem {
  id?: string;
  email: string;
  emailPrincipal: boolean;
}

export interface VeiculoItem {
  id?: string;
  placaVeiculo: string;
  caractVeic: string;
}

export interface HospedeFormData {
  id?: string;
  nome: string;
  nacionalidade: string;
  sexo: string;
  dtNascimento: string;
  cpf: string;
  tipoDoc: string;
  noDoc: string;
  orgaoExp: string;
  noTitEleitor: string;
  cep: string;
  logradouro: string;
  numero: string;
  complEnder: string;
  bairro: string;
  cidade: string;
  uf: string;
  pais: string;
  profissao: string;
  nomePai: string;
  nomeMae: string;
  codEmpresa: string;
  nomeEmpresa: string;
  telefones: TelefoneItem[];
  emails: EmailItem[];
  veiculos: VeiculoItem[];
  ocorrencia: string;
}

interface CadastroHospedeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: HospedeFormData) => void;
  initialData?: HospedeFormData | null;
  initialTab?: "dados" | "contatos" | "veiculos" | "empresa" | "obs" | "historico";
  readOnly?: boolean;
}

interface HospedagemHistoricoItem {
  id: string;
  checkInDate: string;
  expectedCheckOut: string;
  actualCheckOut: string | null;
  isClosed: boolean;
  room: { number: string } | null;
  charges: { amount: string; description: string }[];
}

export default function CadastroHospedeModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  initialTab,
  readOnly = false,
}: CadastroHospedeModalProps) {
  const toast = useToast();
  const { theme } = useTheme();
  const isDark = theme.isDark;

  const [activeTab, setActiveTab] = useState<"dados" | "contatos" | "veiculos" | "empresa" | "obs" | "historico">(initialTab || "dados");

  const [hospedagens, setHospedagens] = useState<HospedagemHistoricoItem[]>([]);
  const [isLoadingHistorico, setIsLoadingHistorico] = useState(false);

  const [loadingHistStayId, setLoadingHistStayId] = useState<string | null>(null);
  const [histActionKind, setHistActionKind] = useState<"extrato" | "resumo" | null>(null);
  const [histExtratoData, setHistExtratoData] = useState<ExtratoRoomData | null>(null);
  const [histResumoData, setHistResumoData] = useState<ResumoRoomData | null>(null);

  // Busca os dados completos (hóspede, diárias e consumo) de UMA hospedagem específica do
  // histórico — inclusive já encerrada — e abre o modal de Extrato ou Resumo correspondente,
  // reaproveitando os mesmos componentes usados no Mapa de Quartos para hospedagens ativas.
  const openHistoricoAction = async (stayId: string, kind: "extrato" | "resumo") => {
    setLoadingHistStayId(stayId);
    setHistActionKind(kind);
    try {
      const [stayRes, paymentsRes] = await Promise.all([
        fetch(`/api/stay/checkin?stayId=${stayId}`).then((r) => r.json()),
        fetch(`/api/caixa/conta-quarto?stayCheckinId=${stayId}`).then((r) => r.json()).catch(() => ({ payments: [] })),
      ]);

      if (!stayRes.success) {
        throw new Error(stayRes.error || "Não foi possível carregar os dados desta hospedagem.");
      }

      const stay = stayRes.stay;
      const payments: { amount: number }[] = paymentsRes?.payments || [];
      const totalAdiantamento = payments.reduce((acc, p) => acc + Number(p.amount), 0);

      const checkIn = new Date(stay.checkInDate);
      const msPerNight = 24 * 60 * 60 * 1000;

      const tariffList = stay.dailyCharges.length > 0
        ? stay.dailyCharges.map((charge: any) => {
            const start = new Date(charge.referenceDate);
            const end = new Date(start.getTime() + msPerNight);
            return {
              description: charge.description || "Diária",
              startDate: formatBrDateTime(start.toISOString()).split(" ")[0],
              endDate: formatBrDateTime(end.toISOString()).split(" ")[0],
              dailyRate: Number(charge.amount),
            };
          })
        : [{
            description: "DIÁRIA",
            startDate: formatBrDateTime(checkIn.toISOString()).split(" ")[0],
            endDate: formatBrDateTime(new Date(checkIn.getTime() + msPerNight).toISOString()).split(" ")[0],
            dailyRate: Number(stay.totalDaily),
          }];

      const nights = Math.max(1, tariffList.length);
      const totalDiarias = Number(stay.totalDaily);
      const totalConsumo = Number(stay.totalConsumption);
      const discount = Number(stay.discount) || 0;
      const totalDespesas = totalDiarias + totalConsumo;

      const consumptionList = stay.consumptions.map((c: any, idx: number) => ({
        itemNumber: idx + 1,
        description: c.productName,
        date: formatBrDateTime(c.createdAt),
        quantity: Number(c.quantity),
        unitPrice: Number(c.unitPrice),
        totalPrice: Number(c.totalPrice),
        operatorName: c.operatorName,
        posLocationName: c.posLocationName,
      }));

      const baseGuest = {
        guestName: stay.guest.fullName,
        cpf: stay.guest.cpf || "",
        phone: stay.guest.phone || "",
        cep: stay.guest.zipCode || "",
        neighborhood: stay.guest.neighborhood || "",
        address: [stay.guest.street, stay.guest.city, stay.guest.state].filter(Boolean).join(", "),
        city: stay.guest.city || "",
        uf: stay.guest.state || "",
        checkInDate: formatBrDateTime(stay.checkInDate),
        prevCheckOutDate: formatBrDateTime(stay.expectedCheckOut),
      };

      if (kind === "extrato") {
        setHistExtratoData({
          ...baseGuest,
          number: stay.roomNumber,
          actualCheckOutDate: stay.actualCheckOut ? formatBrDateTime(stay.actualCheckOut) : formatBrDateTime(new Date().toISOString()),
          extrasAmount: Math.max(0, nights - Math.max(1, Math.round((new Date(stay.expectedCheckOut).getTime() - checkIn.getTime()) / msPerNight))),
          adiantamento: totalAdiantamento,
          desconto: discount,
          allGuests: [
            { id: "primary", name: stay.guest.fullName, isPrimary: true },
            ...stay.secondaryGuests.map((g: any) => ({ id: g.id, name: g.name })),
          ],
          tariffList,
          consumptionList,
        });
      } else {
        setHistResumoData({
          ...baseGuest,
          number: stay.roomNumber,
          calculatedUntil:
            tariffList[tariffList.length - 1]?.endDate ||
            (stay.actualCheckOut ? formatBrDateTime(stay.actualCheckOut) : formatBrDateTime(new Date().toISOString())),
          diariasCount: nights,
          totalDiarias,
          totalConsumo,
          totalDespesas,
          pagamentosAmount: totalAdiantamento,
          descontos: discount,
          saldoAPagar: Math.max(0, totalDespesas - totalAdiantamento - discount),
          consumptionItems: consumptionList.map((c: any) => ({
            dateTime: c.date,
            description: c.description,
            unitPrice: c.unitPrice,
            quantity: c.quantity,
            totalPrice: c.totalPrice,
          })),
        });
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao carregar dados da hospedagem.");
    } finally {
      setLoadingHistStayId(null);
      setHistActionKind(null);
    }
  };

  const [formData, setFormData] = useState<HospedeFormData>({
    nome: "",
    nacionalidade: "Brasileiro",
    sexo: "M",
    dtNascimento: "",
    cpf: "",
    tipoDoc: "RG",
    noDoc: "",
    orgaoExp: "",
    noTitEleitor: "",
    cep: "",
    logradouro: "",
    numero: "",
    complEnder: "",
    bairro: "",
    cidade: "",
    uf: "",
    pais: "Brasil",
    profissao: "",
    nomePai: "",
    nomeMae: "",
    codEmpresa: "",
    nomeEmpresa: "",
    telefones: [],
    emails: [],
    veiculos: [],
    ocorrencia: "",
  });

  const [tempPhone, setTempPhone] = useState("");
  const [tempPhoneDesc, setTempPhoneDesc] = useState("Celular");
  const [tempPhoneMain, setTempPhoneMain] = useState(false);

  const [tempEmail, setTempEmail] = useState("");
  const [tempEmailMain, setTempEmailMain] = useState(false);

  const [tempPlaca, setTempPlaca] = useState("");
  const [tempCaract, setTempCaract] = useState("");
  const [checkingPlaca, setCheckingPlaca] = useState(false);

  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const [docChoice, setDocChoice] = useState<"CPF" | "PASSAPORTE">("CPF");
  const [isSearchingHub, setIsSearchingHub] = useState(false);
  const [hubFeedback, setHubFeedback] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const [empresasConveniadas, setEmpresasConveniadas] = useState<
    { id: string; name: string; tradeName: string | null; cnpj: string }[]
  >([]);
  const [empresaSearchQuery, setEmpresaSearchQuery] = useState("");
  const [showEmpresaDropdown, setShowEmpresaDropdown] = useState(false);

  useEffect(() => {
    if (isOpen) setActiveTab(initialTab || "dados");
  }, [isOpen, initialTab]);

  // Carrega a lista de empresas conveniadas cadastradas para permitir buscar/vincular uma
  // delas ao hóspede em vez de digitar código/nome livremente.
  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/cadastros/empresas")
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.companies)) {
          setEmpresasConveniadas(
            data.companies.map((c: any) => ({
              id: c.id,
              name: c.name,
              tradeName: c.tradeName || null,
              cnpj: c.cnpj || "",
            }))
          );
        }
      })
      .catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
      if (initialData.tipoDoc === "PASSPORT") {
        setDocChoice("PASSAPORTE");
      } else {
        setDocChoice("CPF");
      }
    } else {
      setFormData({
        nome: "",
        nacionalidade: "Brasileiro",
        sexo: "M",
        dtNascimento: "",
        cpf: "",
        tipoDoc: "RG",
        noDoc: "",
        orgaoExp: "",
        noTitEleitor: "",
        cep: "",
        logradouro: "",
        numero: "",
        complEnder: "",
        bairro: "",
        cidade: "",
        uf: "",
        pais: "Brasil",
        profissao: "",
        nomePai: "",
        nomeMae: "",
        codEmpresa: "",
        nomeEmpresa: "",
        telefones: [],
        emails: [],
        veiculos: [],
        ocorrencia: "",
      });
      setDocChoice("CPF");
      setHubFeedback(null);
    }
    setActiveTab(initialTab || "dados");
  }, [initialData, isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen || !initialData?.id) {
      setHospedagens([]);
      return;
    }

    let cancelled = false;
    setIsLoadingHistorico(true);
    fetch(`/api/cadastros/hospedes/${initialData.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setHospedagens(data.checkins || []);
      })
      .catch((err) => console.error("Erro ao buscar histórico de hospedagens", err))
      .finally(() => {
        if (!cancelled) setIsLoadingHistorico(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, initialData?.id]);

  const handleHubCpfSearch = async () => {
    const cleanCpf = formData.cpf.replace(/\D/g, "");
    if (cleanCpf.length !== 11) {
      setHubFeedback({
        type: "error",
        message: "Por favor, digite um CPF válido com 11 dígitos para consultar.",
      });
      return;
    }

    setIsSearchingHub(true);
    setHubFeedback(null);

    try {
      // Verifica primeiro se já existe cadastro deste hóspede no hotel,
      // evitando gastar créditos em uma consulta externa desnecessária.
      const localRes = await fetch(`/api/cadastros/hospedes?q=${cleanCpf}`);
      const localData = await localRes.json();
      const existing = (localData.guests || []).find(
        (g: any) => g.cpf?.replace(/\D/g, "") === cleanCpf && g.id !== initialData?.id
      );

      if (existing) {
        setHubFeedback({
          type: "error",
          message: `Já existe um hóspede cadastrado com este CPF: "${existing.fullName}". Utilize a busca de hóspedes para localizar e editar o cadastro existente.`,
        });
        setIsSearchingHub(false);
        return;
      }

      const res = await fetch(`/api/stay/hub-consult-cpf?cpf=${cleanCpf}`);
      const result = await res.json();

      if (result.success && result.data) {
        const d = result.data;
        setFormData((prev) => {
          const updated = {
            ...prev,
            nome: d.nome || prev.nome,
            dtNascimento: d.dataNascimento || prev.dtNascimento,
            sexo: d.sexo || prev.sexo,
            cpf: d.cpf || prev.cpf,
            logradouro: d.logradouro || prev.logradouro,
            numero: d.numero || prev.numero,
            complEnder: d.complEnder || prev.complEnder,
            bairro: d.bairro || prev.bairro,
            cidade: d.cidade || prev.cidade,
            uf: d.uf || prev.uf,
            cep: d.cep || prev.cep,
            nomeMae: d.nomeDaMae || prev.nomeMae,
            nomePai: d.nomeDoPai || prev.nomePai,
          };

          if (d.telefones && d.telefones.length > 0) {
            updated.telefones = d.telefones.map((tel: string, idx: number) => ({
              telefone: tel,
              descricao: idx === 0 ? "Celular/WhatsApp" : "Contato Adicional",
              telPrincipal: idx === 0,
            }));
          }

          if (d.emails && d.emails.length > 0) {
            updated.emails = d.emails.map((em: string, idx: number) => ({
              email: em,
              emailPrincipal: idx === 0,
            }));
          }

          return updated;
        });

        setHubFeedback({
          type: "success",
          message: `✓ Dados de "${d.nome}" localizados com sucesso!`,
        });
      } else if (result.quotaExceeded) {
        setHubFeedback({
          type: "error",
          message: result.message || "O limite de consultas de CPF do seu hotel foi atingido para este mês.",
        });
      } else if (result.requiresToken) {
        setHubFeedback({
          type: "error",
          message: "A consulta automática de dados não está disponível no momento. Entre em contato com o administrador do sistema.",
        });
      } else {
        setHubFeedback({
          type: "error",
          message: result.message || "CPF não localizado.",
        });
      }
    } catch {
      setHubFeedback({
        type: "error",
        message: "Erro ao consultar CPF.",
      });
    } finally {
      setIsSearchingHub(false);
    }
  };

  if (!isOpen) return null;

  const handleCpfChange = (val: string) => {
    const clean = val.replace(/\D/g, "").slice(0, 11);
    let formatted = clean;
    if (clean.length > 9) {
      formatted = `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9)}`;
    } else if (clean.length > 6) {
      formatted = `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6)}`;
    } else if (clean.length > 3) {
      formatted = `${clean.slice(0, 3)}.${clean.slice(3)}`;
    }
    setFormData((prev) => ({ ...prev, cpf: formatted }));
  };

  const handleCepChange = async (val: string) => {
    const clean = val.replace(/\D/g, "").slice(0, 8);
    let formatted = clean;
    if (clean.length > 5) {
      formatted = `${clean.slice(0, 5)}-${clean.slice(5)}`;
    }
    setFormData((prev) => ({ ...prev, cep: formatted }));

    if (clean.length === 8) {
      setIsSearchingCep(true);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setFormData((prev) => ({
            ...prev,
            logradouro: data.logradouro || prev.logradouro,
            bairro: data.bairro || prev.bairro,
            cidade: data.localidade || prev.cidade,
            uf: data.uf || prev.uf,
          }));
        }
      } catch (err) {
        console.error("Erro busca CEP", err);
      } finally {
        setIsSearchingCep(false);
      }
    }
  };

  const handleAddPhone = () => {
    if (!tempPhone.trim()) return;
    const newItem: TelefoneItem = {
      telefone: tempPhone.trim(),
      descricao: tempPhoneDesc,
      telPrincipal: tempPhoneMain || formData.telefones.length === 0,
    };
    setFormData((prev) => ({
      ...prev,
      telefones: [...prev.telefones, newItem],
    }));
    setTempPhone("");
    setTempPhoneDesc("Celular");
    setTempPhoneMain(false);
  };

  const handleRemovePhone = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      telefones: prev.telefones.filter((_, i) => i !== index),
    }));
  };

  const handleAddEmail = () => {
    if (!tempEmail.trim()) return;
    const newItem: EmailItem = {
      email: tempEmail.trim(),
      emailPrincipal: tempEmailMain || formData.emails.length === 0,
    };
    setFormData((prev) => ({
      ...prev,
      emails: [...prev.emails, newItem],
    }));
    setTempEmail("");
    setTempEmailMain(false);
  };

  const handleRemoveEmail = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      emails: prev.emails.filter((_, i) => i !== index),
    }));
  };

  const handleAddVehicle = async () => {
    const placa = tempPlaca.trim().toUpperCase();
    if (!placa) return;

    if (formData.veiculos.some((v) => v.placaVeiculo.toUpperCase() === placa)) {
      toast.warning("Este veículo já foi adicionado a este hóspede.");
      return;
    }

    setCheckingPlaca(true);
    try {
      const params = new URLSearchParams({ q: placa, by: "placa" });
      const res = await fetch(`/api/veiculos/search?${params.toString()}`);
      const data = await res.json();
      const found = (data.vehicles || []).find(
        (v: { placa: string; guestId: string; guestName: string }) =>
          v.placa.toUpperCase() === placa && v.guestId !== formData.id
      );
      if (found) {
        toast.error(`Veículo já cadastrado para ${found.guestName}`);
        return;
      }
    } catch (error) {
      console.error("Erro ao verificar placa:", error);
      toast.error("Erro ao verificar a placa. Tente novamente.");
      return;
    } finally {
      setCheckingPlaca(false);
    }

    const newItem: VeiculoItem = {
      placaVeiculo: placa,
      caractVeic: tempCaract.trim(),
    };
    setFormData((prev) => ({
      ...prev,
      veiculos: [...prev.veiculos, newItem],
    }));
    setTempPlaca("");
    setTempCaract("");
  };

  const handleRemoveVehicle = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      veiculos: prev.veiculos.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome.trim()) {
      toast.warning("Por favor, preencha o Nome do Hóspede.");
      return;
    }
    onSave(formData);
  };

  const inputClass = isDark
    ? "w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-sky-500"
    : "w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-sky-600 shadow-sm";

  const subInputClass = isDark
    ? "w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white"
    : "w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 shadow-sm";

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className={`border rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh] ${
        isDark ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"
      }`}>
        {/* Header Modal */}
        <div className={`p-6 border-b flex items-center justify-between ${
          isDark ? "border-slate-800 bg-slate-900/90" : "border-slate-200 bg-slate-50/90"
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-3 border rounded-2xl ${
              isDark ? "bg-sky-500/10 border-sky-500/20 text-sky-400" : "bg-sky-50 border-sky-200 text-sky-600"
            }`}>
              <User className="w-6 h-6" />
            </div>
            <div>
              <h2 className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                {readOnly ? "Visualizar Ficha de Hóspede" : initialData ? "Editar Ficha de Hóspede" : "Novo Cadastro de Hóspede"}
              </h2>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Ficha Nacional de Registro de Hóspedes (FNRH)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition ${
              isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-500 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className={`flex items-center gap-2 px-6 pt-4 border-b overflow-x-auto ${
          isDark ? "border-slate-800 bg-slate-900/50" : "border-slate-200 bg-slate-100/60"
        }`}>
          <button
            type="button"
            onClick={() => setActiveTab("dados")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
              activeTab === "dados"
                ? "bg-sky-600 text-white shadow-md shadow-sky-600/20"
                : isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <User className="w-4 h-4" /> Dados Pessoais & Doc
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("contatos")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
              activeTab === "contatos"
                ? "bg-sky-600 text-white shadow-md shadow-sky-600/20"
                : isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <Phone className="w-4 h-4" /> Contatos ({formData.telefones.length + formData.emails.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("veiculos")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
              activeTab === "veiculos"
                ? "bg-sky-600 text-white shadow-md shadow-sky-600/20"
                : isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <Car className="w-4 h-4" /> Veículos ({formData.veiculos.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("empresa")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
              activeTab === "empresa"
                ? "bg-sky-600 text-white shadow-md shadow-sky-600/20"
                : isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <Building2 className="w-4 h-4" /> Empresa Conveniada
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("obs")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
              activeTab === "obs"
                ? "bg-sky-600 text-white shadow-md shadow-sky-600/20"
                : isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <FileText className="w-4 h-4" /> Observações & Ocorrências
          </button>

          {initialData?.id && (
            <button
              type="button"
              onClick={() => setActiveTab("historico")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
                activeTab === "historico"
                  ? "bg-sky-600 text-white shadow-md shadow-sky-600/20"
                  : isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
              }`}
            >
              <History className="w-4 h-4" /> Histórico de Hospedagens ({hospedagens.length})
            </button>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          <fieldset disabled={readOnly} className="contents">
          {/* TAB 1: DADOS PESSOAIS & ENDEREÇO */}
          {activeTab === "dados" && (
            <div className="space-y-6">
              {/* SELEÇÃO DE DOCUMENTO (CPF / PASSAPORTE) & BUSCA API HUB DESENVOLVEDOR */}
              <div className={`p-4 rounded-2xl border space-y-3 ${
                isDark ? "bg-slate-950/70 border-sky-500/30" : "bg-sky-50/70 border-sky-200"
              }`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <span className={`text-xs font-bold uppercase tracking-wider ${
                      isDark ? "text-sky-400" : "text-sky-700"
                    }`}>
                      Identificação do Hóspede:
                    </span>
                    
                    <div className="flex items-center gap-4">
                      <label className="inline-flex items-center gap-2 text-xs font-bold cursor-pointer select-none">
                        <input
                          type="radio"
                          name="docChoice"
                          value="CPF"
                          checked={docChoice === "CPF"}
                          onChange={() => setDocChoice("CPF")}
                          className="w-4 h-4 text-sky-600 focus:ring-sky-500"
                        />
                        <span className={isDark ? "text-slate-200" : "text-slate-800"}>
                          CPF (Pessoa Física)
                        </span>
                      </label>

                      <label className="inline-flex items-center gap-2 text-xs font-bold cursor-pointer select-none">
                        <input
                          type="radio"
                          name="docChoice"
                          value="PASSAPORTE"
                          checked={docChoice === "PASSAPORTE"}
                          onChange={() => {
                            setDocChoice("PASSAPORTE");
                            setFormData((prev) => ({ ...prev, tipoDoc: "PASSPORT" }));
                          }}
                          className="w-4 h-4 text-sky-600 focus:ring-sky-500"
                        />
                        <span className={isDark ? "text-slate-200" : "text-slate-800"}>
                          Passaporte (Estrangeiro)
                        </span>
                      </label>
                    </div>
                  </div>

                  <span className={`text-[11px] px-3 py-1 rounded-full font-mono font-medium flex items-center gap-1.5 ${
                    isDark ? "bg-sky-950/80 text-sky-300 border border-sky-800" : "bg-sky-100 text-sky-800 border border-sky-200"
                  }`}>
                    <Globe className="w-3.5 h-3.5" /> Consulta Automática de Dados
                  </span>
                </div>

                {/* CPF Input + Search Button */}
                {docChoice === "CPF" ? (
                  <div className="flex flex-col sm:flex-row items-stretch gap-3 pt-1">
                    <div className="flex-1 space-y-1">
                      <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                        Digite o CPF do Hóspede
                      </label>
                      <input
                        type="text"
                        placeholder="000.000.000-00"
                        value={formData.cpf}
                        onChange={(e) => handleCpfChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleHubCpfSearch();
                          }
                        }}
                        className={`${inputClass} font-mono text-base font-bold tracking-wide`}
                      />
                    </div>

                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={handleHubCpfSearch}
                        disabled={isSearchingHub}
                        className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 text-white shadow-md ${
                          isSearchingHub
                            ? "bg-slate-600 cursor-not-allowed"
                            : "bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 active:scale-[0.98]"
                        }`}
                      >
                        {isSearchingHub ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Consultando...</span>
                          </>
                        ) : (
                          <>
                            <Search className="w-4 h-4" />
                            <span>Buscar Dados do Hóspede</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                        Número do Passaporte
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: AB123456"
                        value={formData.noDoc}
                        onChange={(e) => setFormData({ ...formData, noDoc: e.target.value.toUpperCase(), tipoDoc: "PASSPORT" })}
                        className={`${inputClass} font-mono uppercase font-bold`}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                        Nacionalidade / País de Origem
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Argentina / Estados Unidos"
                        value={formData.nacionalidade}
                        onChange={(e) => setFormData({ ...formData, nacionalidade: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                  </div>
                )}

                {/* Banner de Feedback da Consulta */}
                {hubFeedback && (
                  <div className={`p-3 rounded-xl text-xs font-medium flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border animate-fadeIn ${
                    hubFeedback.type === "success"
                      ? isDark ? "bg-emerald-950/80 border-emerald-800 text-emerald-300" : "bg-emerald-50 border-emerald-200 text-emerald-800"
                      : isDark ? "bg-rose-950/80 border-rose-800 text-rose-300" : "bg-rose-50 border-rose-200 text-rose-800"
                  }`}>
                    <div className="flex items-center gap-2">
                      {hubFeedback.type === "success" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                      )}
                      <span>{hubFeedback.message}</span>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => setHubFeedback(null)}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-1.5">
                  <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    Nome Completo <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: João da Silva Sauro"
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Nacionalidade</label>
                  <input
                    type="text"
                    value={formData.nacionalidade}
                    onChange={(e) => setFormData({ ...formData, nacionalidade: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Sexo</label>
                  <select
                    value={formData.sexo}
                    onChange={(e) => setFormData({ ...formData, sexo: e.target.value })}
                    className={inputClass}
                  >
                    <option value="M">Masculino</option>
                    <option value="F">Feminino</option>
                    <option value="O">Outro / Não Informado</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Data de Nascimento</label>
                  <input
                    type="date"
                    value={formData.dtNascimento}
                    onChange={(e) => setFormData({ ...formData, dtNascimento: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>CPF / Passaporte</label>
                  <input
                    type="text"
                    placeholder="000.000.000-00"
                    value={docChoice === "CPF" ? formData.cpf : formData.noDoc}
                    onChange={(e) => docChoice === "CPF" ? handleCpfChange(e.target.value) : setFormData({ ...formData, noDoc: e.target.value })}
                    className={`${inputClass} font-mono`}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Profissão</label>
                  <input
                    type="text"
                    placeholder="Ex: Engenheiro"
                    value={formData.profissao}
                    onChange={(e) => setFormData({ ...formData, profissao: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Documentos secundários */}
              <div className={`p-4 rounded-2xl border space-y-4 ${
                isDark ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200"
              }`}>
                <span className="text-xs font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider block">
                  Documentação Complementar
                </span>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Tipo Doc</label>
                    <select
                      value={formData.tipoDoc}
                      onChange={(e) => setFormData({ ...formData, tipoDoc: e.target.value })}
                      className={subInputClass}
                    >
                      <option value="RG">RG Identidade</option>
                      <option value="CNH">CNH Carteira Motorista</option>
                      <option value="PASSPORT">Passaporte</option>
                      <option value="RNE">RNE Estrangeiro</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Nº do Documento</label>
                    <input
                      type="text"
                      value={formData.noDoc}
                      onChange={(e) => setFormData({ ...formData, noDoc: e.target.value })}
                      className={subInputClass}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Órgão Expedidor</label>
                    <input
                      type="text"
                      placeholder="Ex: SSP/DF"
                      value={formData.orgaoExp}
                      onChange={(e) => setFormData({ ...formData, orgaoExp: e.target.value })}
                      className={subInputClass}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Título de Eleitor</label>
                    <input
                      type="text"
                      value={formData.noTitEleitor}
                      onChange={(e) => setFormData({ ...formData, noTitEleitor: e.target.value })}
                      className={subInputClass}
                    />
                  </div>
                </div>
              </div>

              {/* Endereço */}
              <div className={`p-4 rounded-2xl border space-y-4 ${
                isDark ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200"
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider block flex items-center gap-1.5">
                    <MapPin className="w-4 h-4" /> Endereço Residencial (FNRH)
                  </span>
                  {isSearchingCep && (
                    <span className="text-xs text-amber-500 animate-pulse font-semibold">Buscando CEP...</span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>CEP</label>
                    <input
                      type="text"
                      placeholder="70000-000"
                      value={formData.cep}
                      onChange={(e) => handleCepChange(e.target.value)}
                      className={`${subInputClass} font-mono`}
                    />
                  </div>

                  <div className="md:col-span-2 space-y-1.5">
                    <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Logradouro / Rua</label>
                    <input
                      type="text"
                      value={formData.logradouro}
                      onChange={(e) => setFormData({ ...formData, logradouro: e.target.value })}
                      className={subInputClass}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Número</label>
                    <input
                      type="text"
                      value={formData.numero}
                      onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                      className={subInputClass}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Complemento</label>
                    <input
                      type="text"
                      placeholder="Apto 101"
                      value={formData.complEnder}
                      onChange={(e) => setFormData({ ...formData, complEnder: e.target.value })}
                      className={subInputClass}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Bairro</label>
                    <input
                      type="text"
                      value={formData.bairro}
                      onChange={(e) => setFormData({ ...formData, bairro: e.target.value })}
                      className={subInputClass}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Cidade</label>
                    <input
                      type="text"
                      value={formData.cidade}
                      onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                      className={subInputClass}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>UF / Estado</label>
                    <input
                      type="text"
                      maxLength={2}
                      placeholder="DF"
                      value={formData.uf}
                      onChange={(e) => setFormData({ ...formData, uf: e.target.value.toUpperCase() })}
                      className={`${subInputClass} font-mono uppercase`}
                    />
                  </div>
                </div>
              </div>

              {/* Filiação */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Nome da Mãe</label>
                  <input
                    type="text"
                    value={formData.nomeMae}
                    onChange={(e) => setFormData({ ...formData, nomeMae: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Nome do Pai</label>
                  <input
                    type="text"
                    value={formData.nomePai}
                    onChange={(e) => setFormData({ ...formData, nomePai: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CONTATOS */}
          {activeTab === "contatos" && (
            <div className="space-y-6">
              <div className={`p-5 rounded-2xl border space-y-4 ${
                isDark ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200"
              }`}>
                <div className="flex items-center justify-between">
                  <h3 className={`text-sm font-bold flex items-center gap-2 ${isDark ? "text-white" : "text-slate-900"}`}>
                    <Phone className="w-4 h-4 text-sky-500" /> Telefones Cadastrados
                  </h3>
                  <span className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>Table_Telefones</span>
                </div>

                <div className={`grid grid-cols-1 md:grid-cols-12 gap-3 items-end p-3 rounded-xl border ${
                  isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200 shadow-sm"
                }`}>
                  <div className="md:col-span-5 space-y-1">
                    <label className={`text-[10px] ${isDark ? "text-slate-400" : "text-slate-600"}`}>Número do Telefone/WhatsApp</label>
                    <input
                      type="text"
                      placeholder="(61) 99999-9999"
                      value={tempPhone}
                      onChange={(e) => setTempPhone(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div className="md:col-span-3 space-y-1">
                    <label className={`text-[10px] ${isDark ? "text-slate-400" : "text-slate-600"}`}>Descrição / Tipo</label>
                    <select
                      value={tempPhoneDesc}
                      onChange={(e) => setTempPhoneDesc(e.target.value)}
                      className={inputClass}
                    >
                      <option value="Celular">Celular / WhatsApp</option>
                      <option value="Residencial">Residencial</option>
                      <option value="Comercial">Comercial</option>
                      <option value="Recado">Recado</option>
                    </select>
                  </div>

                  <div className="md:col-span-2 flex items-center h-9">
                    <label className={`flex items-center gap-2 cursor-pointer text-xs ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                      <input
                        type="checkbox"
                        checked={tempPhoneMain}
                        onChange={(e) => setTempPhoneMain(e.target.checked)}
                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-600"
                      />
                      Principal
                    </label>
                  </div>

                  <div className="md:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddPhone}
                      className="w-full py-2 px-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition shadow-sm"
                    >
                      <Plus className="w-4 h-4" /> Adicionar
                    </button>
                  </div>
                </div>

                <div className={`border rounded-xl overflow-hidden ${isDark ? "border-slate-800" : "border-slate-200"}`}>
                  <table className="w-full text-left text-xs">
                    <thead className={`font-mono ${isDark ? "bg-slate-900 text-slate-400" : "bg-slate-100 text-slate-600"}`}>
                      <tr>
                        <th className="px-4 py-2">Telefone</th>
                        <th className="px-4 py-2">Descrição</th>
                        <th className="px-4 py-2 text-center">Principal</th>
                        <th className="px-4 py-2 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDark ? "divide-slate-800" : "divide-slate-200"}`}>
                      {formData.telefones.map((tel, idx) => (
                        <tr key={idx} className={isDark ? "hover:bg-slate-800/50 text-white" : "hover:bg-slate-50 text-slate-900"}>
                          <td className="px-4 py-2 font-mono font-medium">{tel.telefone}</td>
                          <td className="px-4 py-2">{tel.descricao}</td>
                          <td className="px-4 py-2 text-center">
                            {tel.telPrincipal ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">
                                SIM
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[10px]">NÃO</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemovePhone(idx)}
                              className="text-rose-500 hover:text-rose-600 p-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}

                      {formData.telefones.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-4 text-center text-slate-400">
                            Nenhum telefone adicionado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Emails Section */}
              <div className={`p-5 rounded-2xl border space-y-4 ${
                isDark ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200"
              }`}>
                <div className="flex items-center justify-between">
                  <h3 className={`text-sm font-bold flex items-center gap-2 ${isDark ? "text-white" : "text-slate-900"}`}>
                    <Mail className="w-4 h-4 text-sky-500" /> Endereços de E-mail
                  </h3>
                  <span className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>Table_Email</span>
                </div>

                <div className={`grid grid-cols-1 md:grid-cols-12 gap-3 items-end p-3 rounded-xl border ${
                  isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200 shadow-sm"
                }`}>
                  <div className="md:col-span-8 space-y-1">
                    <label className={`text-[10px] ${isDark ? "text-slate-400" : "text-slate-600"}`}>E-mail</label>
                    <input
                      type="email"
                      placeholder="hospede@email.com"
                      value={tempEmail}
                      onChange={(e) => setTempEmail(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div className="md:col-span-2 flex items-center h-9">
                    <label className={`flex items-center gap-2 cursor-pointer text-xs ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                      <input
                        type="checkbox"
                        checked={tempEmailMain}
                        onChange={(e) => setTempEmailMain(e.target.checked)}
                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-600"
                      />
                      Principal
                    </label>
                  </div>

                  <div className="md:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddEmail}
                      className="w-full py-2 px-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition shadow-sm"
                    >
                      <Plus className="w-4 h-4" /> Adicionar
                    </button>
                  </div>
                </div>

                <div className={`border rounded-xl overflow-hidden ${isDark ? "border-slate-800" : "border-slate-200"}`}>
                  <table className="w-full text-left text-xs">
                    <tbody className={`divide-y ${isDark ? "divide-slate-800" : "divide-slate-200"}`}>
                      {formData.emails.map((em, idx) => (
                        <tr key={idx} className={isDark ? "hover:bg-slate-800/50 text-white" : "hover:bg-slate-50 text-slate-900"}>
                          <td className="px-4 py-2 font-medium">{em.email}</td>
                          <td className="px-4 py-2 text-center">
                            {em.emailPrincipal ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">
                                PRINCIPAL
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[10px]">SECUNDÁRIO</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveEmail(idx)}
                              className="text-rose-500 hover:text-rose-600 p-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}

                      {formData.emails.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-4 py-4 text-center text-slate-400">
                            Nenhum e-mail adicionado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: VEÍCULOS */}
          {activeTab === "veiculos" && (
            <div className="space-y-6">
              <div className={`p-5 rounded-2xl border space-y-4 ${
                isDark ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200"
              }`}>
                <div className="flex items-center justify-between">
                  <h3 className={`text-sm font-bold flex items-center gap-2 ${isDark ? "text-white" : "text-slate-900"}`}>
                    <Car className="w-4 h-4 text-sky-500" /> Veículos do Hóspede (Estacionamento)
                  </h3>
                  <span className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>Edt_PlacaVeiculo / Edt_CaractVeic</span>
                </div>

                <div className={`grid grid-cols-1 md:grid-cols-12 gap-3 items-end p-3 rounded-xl border ${
                  isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200 shadow-sm"
                }`}>
                  <div className="md:col-span-4 space-y-1">
                    <label className={`text-[10px] ${isDark ? "text-slate-400" : "text-slate-600"}`}>Placa do Veículo</label>
                    <input
                      type="text"
                      placeholder="ABC-1234 ou ABC1D23"
                      value={tempPlaca}
                      onChange={(e) => setTempPlaca(e.target.value.toUpperCase())}
                      className={`${inputClass} font-mono uppercase`}
                    />
                  </div>

                  <div className="md:col-span-6 space-y-1">
                    <label className={`text-[10px] ${isDark ? "text-slate-400" : "text-slate-600"}`}>Modelo / Cor / Características</label>
                    <input
                      type="text"
                      placeholder="Ex: Corolla Prata 2022"
                      value={tempCaract}
                      onChange={(e) => setTempCaract(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddVehicle}
                      disabled={checkingPlaca}
                      className="w-full py-2 px-3 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition shadow-sm"
                    >
                      <Plus className="w-4 h-4" /> {checkingPlaca ? "Verificando..." : "Adicionar"}
                    </button>
                  </div>
                </div>

                <div className={`border rounded-xl overflow-hidden ${isDark ? "border-slate-800" : "border-slate-200"}`}>
                  <table className="w-full text-left text-xs">
                    <thead className={`font-mono ${isDark ? "bg-slate-900 text-slate-400" : "bg-slate-100 text-slate-600"}`}>
                      <tr>
                        <th className="px-4 py-2">Placa</th>
                        <th className="px-4 py-2">Modelo / Características</th>
                        <th className="px-4 py-2 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDark ? "divide-slate-800" : "divide-slate-200"}`}>
                      {formData.veiculos.map((v, idx) => (
                        <tr key={idx} className={isDark ? "hover:bg-slate-800/50 text-white" : "hover:bg-slate-50 text-slate-900"}>
                          <td className="px-4 py-2 font-mono font-bold text-amber-600 dark:text-amber-400">{v.placaVeiculo}</td>
                          <td className="px-4 py-2">{v.caractVeic || "-"}</td>
                          <td className="px-4 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveVehicle(idx)}
                              className="text-rose-500 hover:text-rose-600 p-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}

                      {formData.veiculos.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-4 py-4 text-center text-slate-400">
                            Nenhum veículo vinculado a este hóspede.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: EMPRESA CONVENIADA */}
          {activeTab === "empresa" && (
            <div className="space-y-6">
              <div className={`p-5 rounded-2xl border space-y-4 ${
                isDark ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200"
              }`}>
                <div className="flex items-center justify-between">
                  <h3 className={`text-sm font-bold flex items-center gap-2 ${isDark ? "text-white" : "text-slate-900"}`}>
                    <Building2 className="w-4 h-4 text-sky-500" /> Empresa Conveniada Vinculada
                  </h3>
                </div>

                {formData.codEmpresa ? (
                  <div className={`flex items-center justify-between gap-3 p-3 rounded-xl border ${
                    isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-300"
                  }`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <Building2 className="w-5 h-5 text-sky-500 shrink-0" />
                      <div className="min-w-0">
                        <p className={`text-sm font-bold truncate ${isDark ? "text-white" : "text-slate-900"}`}>{formData.nomeEmpresa}</p>
                        <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                          {empresasConveniadas.find((e) => e.id === formData.codEmpresa)?.cnpj || "Empresa cadastrada"}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, codEmpresa: "", nomeEmpresa: "" })}
                      className="text-rose-500 hover:text-rose-600 p-1.5 shrink-0"
                      title="Desvincular empresa"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative space-y-1.5">
                    <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                      Buscar empresa cadastrada por razão social, fantasia ou CNPJ
                    </label>
                    <div className="relative">
                      <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? "text-slate-500" : "text-slate-400"}`} />
                      <input
                        type="text"
                        placeholder="Ex: Petrobras S.A."
                        value={empresaSearchQuery}
                        onChange={(e) => {
                          setEmpresaSearchQuery(e.target.value);
                          setShowEmpresaDropdown(true);
                        }}
                        onFocus={() => setShowEmpresaDropdown(true)}
                        onBlur={() => setTimeout(() => setShowEmpresaDropdown(false), 150)}
                        className={`${inputClass} pl-9`}
                      />
                    </div>

                    {showEmpresaDropdown && (
                      <div className={`absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border shadow-lg ${
                        isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"
                      }`}>
                        {empresasConveniadas
                          .filter((e) => {
                            const q = empresaSearchQuery.trim().toLowerCase();
                            if (!q) return true;
                            return (
                              e.name.toLowerCase().includes(q) ||
                              (e.tradeName || "").toLowerCase().includes(q) ||
                              e.cnpj.includes(q)
                            );
                          })
                          .slice(0, 20)
                          .map((e) => (
                            <button
                              key={e.id}
                              type="button"
                              onMouseDown={() => {
                                setFormData({ ...formData, codEmpresa: e.id, nomeEmpresa: e.name });
                                setEmpresaSearchQuery("");
                                setShowEmpresaDropdown(false);
                              }}
                              className={`w-full text-left px-3 py-2 text-sm border-b last:border-0 ${
                                isDark
                                  ? "border-slate-800 hover:bg-slate-800 text-white"
                                  : "border-slate-100 hover:bg-slate-50 text-slate-900"
                              }`}
                            >
                              <p className="font-semibold truncate">{e.name}</p>
                              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                                {e.tradeName ? `${e.tradeName} · ` : ""}{e.cnpj || "Sem CNPJ"}
                              </p>
                            </button>
                          ))}

                        {empresasConveniadas.filter((e) => {
                          const q = empresaSearchQuery.trim().toLowerCase();
                          if (!q) return true;
                          return (
                            e.name.toLowerCase().includes(q) ||
                            (e.tradeName || "").toLowerCase().includes(q) ||
                            e.cnpj.includes(q)
                          );
                        }).length === 0 && (
                          <p className={`px-3 py-3 text-xs text-center ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                            Nenhuma empresa encontrada. Cadastre-a em Empresas Conveniadas.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs text-indigo-700 dark:text-indigo-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-indigo-500 mt-0.5" />
                  <p>
                    Vincular uma empresa autoriza o faturamento direto no checkout: ao fechar a hospedagem com forma de pagamento parcelada (ex: fatura), o débito vai para o Contas a Receber em nome da empresa, mantendo o hóspede registrado como origem do débito.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: OBSERVAÇÕES & OCORRÊNCIAS */}
          {activeTab === "obs" && (
            <div className="space-y-6">
              <div className={`p-5 rounded-2xl border space-y-4 ${
                isDark ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200"
              }`}>
                <h3 className={`text-sm font-bold flex items-center gap-2 ${isDark ? "text-white" : "text-slate-900"}`}>
                  <FileText className="w-4 h-4 text-sky-500" /> Histórico de Observações & Ocorrências
                </h3>

                <div className="space-y-1.5">
                  <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    Ocorrências, restrições ou preferências do hóspede
                  </label>
                  <textarea
                    rows={6}
                    placeholder="Ex: Preferência por quarto em andar alto. Alérgico a travesseiro de penas. Histórico de consumo especial..."
                    value={formData.ocorrencia}
                    onChange={(e) => setFormData({ ...formData, ocorrencia: e.target.value })}
                    className={`${inputClass} leading-relaxed`}
                  />
                </div>
              </div>
            </div>
          )}
          </fieldset>

          {/* TAB 6: HISTÓRICO DE HOSPEDAGENS */}
          {activeTab === "historico" && (
            <div className="space-y-6">
              <div className={`p-5 rounded-2xl border space-y-4 ${
                isDark ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200"
              }`}>
                <div className="flex items-center justify-between">
                  <h3 className={`text-sm font-bold flex items-center gap-2 ${isDark ? "text-white" : "text-slate-900"}`}>
                    <History className="w-4 h-4 text-sky-500" /> Hospedagens Anteriores e Atuais
                  </h3>
                  <span className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>StayCheckin (primaryGuestId)</span>
                </div>

                <div className={`border rounded-xl overflow-hidden ${isDark ? "border-slate-800" : "border-slate-200"}`}>
                  <table className="w-full text-left text-xs">
                    <thead className={`font-mono ${isDark ? "bg-slate-900 text-slate-400" : "bg-slate-100 text-slate-600"}`}>
                      <tr>
                        <th className="px-4 py-2">Quarto</th>
                        <th className="px-4 py-2">Check-in</th>
                        <th className="px-4 py-2">Saída Prevista</th>
                        <th className="px-4 py-2">Check-out</th>
                        <th className="px-4 py-2 text-center">Status</th>
                        <th className="px-4 py-2 text-right">Total Diárias</th>
                        <th className="px-4 py-2 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDark ? "divide-slate-800" : "divide-slate-200"}`}>
                      {isLoadingHistorico && (
                        <tr>
                          <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                            <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando histórico...
                          </td>
                        </tr>
                      )}

                      {!isLoadingHistorico && hospedagens.map((h) => {
                        const totalDiarias = h.charges.reduce((sum, c) => sum + Number(c.amount), 0);
                        const isBusy = loadingHistStayId === h.id;
                        return (
                          <tr key={h.id} className={isDark ? "hover:bg-slate-800/50 text-white" : "hover:bg-slate-50 text-slate-900"}>
                            <td className="px-4 py-2 font-mono font-bold text-sky-600 dark:text-sky-400">
                              <span className="inline-flex items-center gap-1">
                                <DoorOpen className="w-3.5 h-3.5" /> {h.room?.number || "-"}
                              </span>
                            </td>
                            <td className="px-4 py-2">{new Date(h.checkInDate).toLocaleString("pt-BR")}</td>
                            <td className="px-4 py-2">{new Date(h.expectedCheckOut).toLocaleString("pt-BR")}</td>
                            <td className="px-4 py-2">
                              {h.actualCheckOut ? new Date(h.actualCheckOut).toLocaleString("pt-BR") : "-"}
                            </td>
                            <td className="px-4 py-2 text-center">
                              {h.isClosed ? (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">
                                  FINALIZADA
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold text-[10px]">
                                  EM ANDAMENTO
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right font-semibold">
                              {totalDiarias.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  title="Visualizar / Extrato da hospedagem"
                                  disabled={isBusy}
                                  onClick={() => openHistoricoAction(h.id, "extrato")}
                                  className={`p-1.5 rounded-lg border transition disabled:opacity-50 ${
                                    isDark ? "border-slate-700 hover:bg-slate-800 text-sky-400" : "border-slate-300 hover:bg-slate-100 text-sky-600"
                                  }`}
                                >
                                  {isBusy && histActionKind === "extrato" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                  type="button"
                                  title="Imprimir resumo da hospedagem"
                                  disabled={isBusy}
                                  onClick={() => openHistoricoAction(h.id, "resumo")}
                                  className={`p-1.5 rounded-lg border transition disabled:opacity-50 ${
                                    isDark ? "border-slate-700 hover:bg-slate-800 text-slate-300" : "border-slate-300 hover:bg-slate-100 text-slate-700"
                                  }`}
                                >
                                  {isBusy && histActionKind === "resumo" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {!isLoadingHistorico && hospedagens.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-4 text-center text-slate-400 italic">
                            Nenhuma hospedagem registrada para este hóspede ainda.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {hospedagens.length > 0 && (
                    <p className={`px-4 py-2 text-[11px] border-t ${isDark ? "border-slate-800 text-slate-500" : "border-slate-200 text-slate-500"}`}>
                      <Eye className="w-3 h-3 inline -mt-0.5 mr-1" /> Extrato: visualizar, imprimir, enviar por WhatsApp ou e-mail. <Printer className="w-3 h-3 inline -mt-0.5 mr-1 ml-2" /> Resumo: imprimir.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Footer Actions */}
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
              {readOnly ? "Fechar" : "Cancelar"}
            </button>

            {!readOnly && (
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-sky-600/20 transition"
              >
                <Check className="w-4 h-4" /> Salvar Hóspede (FNRH)
              </button>
            )}
          </div>
        </form>
      </div>

      {histExtratoData && (
        <ImprimirExtratoHospedagemModal
          isOpen={!!histExtratoData}
          onClose={() => setHistExtratoData(null)}
          roomData={histExtratoData}
        />
      )}

      {histResumoData && (
        <ImprimirResumoHospedagemModal
          isOpen={!!histResumoData}
          onClose={() => setHistResumoData(null)}
          roomData={histResumoData}
        />
      )}
    </div>
  );
}
