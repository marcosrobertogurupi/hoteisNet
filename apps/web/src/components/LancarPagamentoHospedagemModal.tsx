"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Plus,
  Printer,
  Eye,
  Car,
  Check,
  Trash2,
  Calendar,
  DollarSign,
  AlertCircle,
  FileText,
  MessageSquare,
  Building2,
  ChevronDown,
  Mail,
  Loader2,
  LogOut
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { useOperator } from "@/context/OperatorContext";
import { useConfirm } from "@/context/ConfirmContext";
import { usePrompt } from "@/context/PromptContext";
import { generateReciboPdfBase64, generateConsumoPdfBase64 } from "@/utils/pdfGenerator";
import CadastroHospedeModal, { HospedeFormData } from "@/components/CadastroHospedeModal";


export interface PaymentCreditItem {
  id: string;
  date: string;              // e.g. "12/08/2026 14:35"
  amount: number;            // e.g. 150.00
  methodDescription: string; // e.g. "DINHEIRO", "PIX", "CARTAO", etc.
  operatorName?: string;     // operador que efetuou o lançamento
  caixaMovimentoId?: string;
}

export interface ObservationLog {
  id: string;
  dateTime: string;          // e.g. "12/08/2026 09:42"
  type: string;              // e.g. "PAGAMENTO", "RECEPÇÃO", "SISTEMA"
  user: string;              // e.g. "MARCOS"
  note: string;
}

export interface GuestItem {
  id: string;
  name: string;
}

export interface LancarPagamentoHospedagemModalProps {
  isOpen: boolean;
  onClose: () => void;
  stayData: {
    idHospedagem: string;
    roomNumber: string;
    primaryGuestId?: string;
    primaryGuestName: string;
    checkInDate: string;          // e.g. "05/02/2026 13:08:42"
    expectedCheckOutDate: string; // e.g. "08/02/2026 14:00:00"
    actualCheckOutDate?: string;  // e.g. "12/08/2026 09:39:20"
    dailyCount: number;
    extrasCount?: number;
    totalDiarias: number;
    totalConsumo: number;
    consumptionsDetail?: { dateTime: string; productName: string; quantity: number; unitPrice: number; totalPrice: number }[];
    outrosDebitos?: number;
    outrosDebitosDetail?: { id: string; amount: number; createdAt: string; fromRoomNumber: string; fromGuestName: string; operatorName: string | null }[];
    desconto?: number;
    guestsList?: GuestItem[];
    initialPayments?: PaymentCreditItem[];
    initialObservations?: ObservationLog[];
  };
  onSaveSuccess?: (updatedData: {
    totalPagamentos: number;
    saldoAPagar: number;
    payments: PaymentCreditItem[];
    observations: ObservationLog[];
  }) => void;
  // Chamado quando o saldo é totalmente quitado e o usuário confirma o check-out do hóspede.
  onCheckoutConfirmed?: () => void;
  // Chamado ao clicar no "+" de Consumo — abre a tela real de Lançamento de Consumo do Quarto por cima deste modal.
  onOpenConsumo?: () => void;
  // Chamado ao clicar no olho de Total Diárias — abre o Extrato de Hospedagem real por cima deste modal.
  onOpenExtrato?: () => void;
  // Chamado ao clicar em "Imprimir resumo de hospedagem" — abre o Resumo de Hospedagem real por cima deste modal.
  onOpenResumo?: () => void;
  // "payment" (padrão): lança pagamentos/adiantamentos na hospedagem sem nunca encerrá-la — botão
  // fixo em "Salvar Crédito", mesmo que o saldo chegue a zero ou os pagamentos ultrapassem o débito
  // (o excedente vira crédito no saldo do hóspede automaticamente via processPaymentLine).
  // "checkout": único modo que efetivamente encerra a hospedagem (chama onCheckoutConfirmed) — só
  // permitido quando o débito está zerado; aberto pelo item "Encerrar Hospedagem" do menu de
  // contexto ou por duplo-clique no quarto ocupado, as duas únicas portas de entrada do check-out.
  mode?: "payment" | "checkout";
}

interface PaymentMethodOption {
  id: string;
  description: string;
  installment: boolean;
  debitGuestBalance: boolean;
  transferDebit: boolean;
  sumsToCashRegister: boolean;
}

export default function LancarPagamentoHospedagemModal({
  isOpen,
  onClose,
  stayData,
  onSaveSuccess,
  onCheckoutConfirmed,
  onOpenConsumo,
  onOpenExtrato,
  onOpenResumo,
  mode = "payment",
}: LancarPagamentoHospedagemModalProps) {
  const isCheckoutMode = mode === "checkout";
  const {
    theme,
    hotelName,
    uazapiServerUrl,
    uazapiInstanceToken,
    emailSmtpHost,
    emailSmtpPort,
    emailSmtpSecure,
    emailSmtpUser,
    emailSmtpPass,
    emailFromName,
    emailFromAddress,
    emailFooterText,
    sendPaymentConfirmEmailEnabled,
  } = useTheme();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const promptDialog = usePrompt();
  const { operatorId: activeOperatorId, operatorName: activeOperatorName } = useOperator();

  // Financial values
  const totalDiarias = stayData.totalDiarias ?? 0.0;
  const [totalConsumo, setTotalConsumo] = useState<number>(stayData.totalConsumo ?? 0.0);
  // Mantém o Consumo(R$) sincronizado quando a tela de Lançamento de Consumo do Quarto (aberta
  // pelo "+") salva alterações e o pai atualiza os dados reais da hospedagem.
  useEffect(() => {
    setTotalConsumo(stayData.totalConsumo ?? 0.0);
  }, [stayData.totalConsumo]);
  const outrosDebitos = stayData.outrosDebitos ?? 0.0;
  const outrosDebitosDetail = stayData.outrosDebitosDetail ?? [];
  const [showOutrosDebitosModal, setShowOutrosDebitosModal] = useState<boolean>(false);
  const [desconto, setDesconto] = useState<number>(stayData.desconto || 0.0);
  // Mesmo motivo do totalConsumo/payments acima: sem isto, reabrir a tela mantém o desconto da
  // hospedagem/quarto anterior em vez do valor real vindo do banco pela prop.
  useEffect(() => {
    setDesconto(stayData.desconto || 0.0);
  }, [stayData.desconto]);

  // Payments State
  const [payments, setPayments] = useState<PaymentCreditItem[]>(
    stayData.initialPayments || []
  );
  // O componente permanece montado entre uma hospedagem e outra (só desmonta quando isOpen vira
  // false), então o valor inicial do useState acima só é usado na primeira vez. Sem este efeito,
  // reabrir o modal (mesmo quarto ou outro) mostra a lista de pagamentos desatualizada — o
  // histórico real (buscado em /api/caixa/conta-quarto) chega pela prop, não pelo estado inicial.
  useEffect(() => {
    setPayments(stayData.initialPayments || []);
  }, [stayData.initialPayments]);

  // Faturas (formas de pagamento com Parcelamento) só são aceitas pela empresa faturada se o
  // hóspede assinar o Resumo de Hospedagem no ato do check-out. Fica true assim que o operador
  // opta por imprimir o resumo a partir do aviso obrigatório abaixo, liberando o check-out na
  // próxima tentativa. Reseta ao trocar de hospedagem, para não "vazar" a confirmação de uma
  // hospedagem para a próxima que o modal exibir.
  const [resumoAcknowledgedForSignature, setResumoAcknowledgedForSignature] = useState(false);
  useEffect(() => {
    setResumoAcknowledgedForSignature(false);
  }, [stayData.idHospedagem]);

  // Observations State
  const [observations, setObservations] = useState<ObservationLog[]>(
    stayData.initialObservations || []
  );
  const [selectedObsId, setSelectedObsId] = useState<string | null>(null);
  const [newObsText, setNewObsText] = useState<string>("");

  // New Payment Input Form
  const [dtPagto, setDtPagto] = useState<string>(
    new Date().toLocaleDateString("pt-BR")
  );
  const [vlrPagto, setVlrPagto] = useState<string>("0,00");
  const [formaPagamento, setFormaPagamento] = useState<string>("DINHEIRO");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);

  // Busca as formas de pagamento cadastradas (Cadastros > Formas de Pagamento) para popular o
  // seletor abaixo. Formas marcadas como "Transf.Débito" ficam de fora: esse fluxo é acionado
  // exclusivamente pelo botão dedicado de Transferência de Débito entre Quartos, não por aqui.
  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        const res = await fetch("/api/cadastros/formas-pagamento");
        const data = await res.json();
        if (!data?.success || !Array.isArray(data.paymentMethods)) return;
        const options: PaymentMethodOption[] = data.paymentMethods
          .filter((f: any) => f.active !== false && !f.transferDebit)
          .map((f: any) => ({
            id: f.id,
            description: f.description,
            installment: !!f.installment,
            debitGuestBalance: !!f.debitGuestBalance,
            transferDebit: !!f.transferDebit,
            sumsToCashRegister: !!f.sumsToCashRegister,
          }));
        setPaymentMethods(options);
        if (options.length > 0 && !options.some((o) => o.description === formaPagamento)) {
          setFormaPagamento(options[0].description);
        }
      } catch (err) {
        console.warn("[LancarPagamentoHospedagemModal] Erro ao buscar formas de pagamento:", err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Filter for Guests Table
  const [guestFilter, setGuestFilter] = useState<string>("");

  // Quick Modal States
  const [showReciboModal, setShowReciboModal] = useState<boolean>(false);
  const [reciboPayments, setReciboPayments] = useState<PaymentCreditItem[]>([]);

  const [isSaving, setIsSaving] = useState<boolean>(false);
  // Lançamentos já persistidos (têm caixaMovimentoId) marcados para exclusão: só são apagados
  // do caixa de fato quando o usuário clicar em "Salvar Crédito" — se o modal for fechado sem
  // salvar, a exclusão é descartada e o lançamento reaparece normalmente na próxima abertura.
  const [pendingDeletions, setPendingDeletions] = useState<string[]>([]);
  const [sendingEmailPayment, setSendingEmailPayment] = useState<boolean>(false);
  const [sendingWhatsappPayment, setSendingWhatsappPayment] = useState<boolean>(false);

  // Cadastro do Hóspede (visualização/edição de dados e de veículos, abertos pelos botões
  // "olho" e "carro" ao lado do nome do hóspede principal)
  const [showCadastroHospede, setShowCadastroHospede] = useState<boolean>(false);
  const [cadastroHospedeTab, setCadastroHospedeTab] = useState<"dados" | "veiculos">("dados");
  const [cadastroHospedeReadOnly, setCadastroHospedeReadOnly] = useState<boolean>(false);
  const [cadastroHospedeData, setCadastroHospedeData] = useState<HospedeFormData | null>(null);
  const [loadingCadastroHospede, setLoadingCadastroHospede] = useState<boolean>(false);

  const openCadastroHospede = async (tab: "dados" | "veiculos") => {
    if (!stayData.primaryGuestId) {
      toast.warning("Este hóspede não está vinculado a um cadastro.", "Cadastro Indisponível");
      return;
    }
    setCadastroHospedeTab(tab);
    setCadastroHospedeReadOnly(tab === "veiculos");
    setLoadingCadastroHospede(true);
    try {
      const res = await fetch(`/api/cadastros/hospedes/${stayData.primaryGuestId}`);
      const guest = await res.json();
      if (!res.ok) throw new Error(guest.error || "Não foi possível carregar o cadastro do hóspede.");

      setCadastroHospedeData({
        id: guest.id,
        nome: guest.fullName,
        cpf: guest.cpf || "",
        tipoDoc: guest.passport ? "PASSPORT" : "RG",
        noDoc: guest.passport || "",
        orgaoExp: "",
        noTitEleitor: "",
        sexo: guest.gender || "M",
        nacionalidade: guest.country || "Brasileira",
        dtNascimento: guest.birthDate ? String(guest.birthDate).substring(0, 10) : "",
        cep: guest.zipCode || "",
        logradouro: guest.street || "",
        numero: guest.number || "",
        complEnder: "",
        bairro: guest.neighborhood || "",
        cidade: guest.city || "",
        uf: guest.state || "",
        pais: guest.country || "Brasil",
        profissao: "",
        nomePai: "",
        nomeMae: "",
        codEmpresa: guest.companyId || "",
        nomeEmpresa: guest.company?.name || "",
        telefones: guest.phone
          ? [{ telefone: guest.phone, descricao: "Celular", telPrincipal: true }]
          : [],
        emails: guest.email ? [{ email: guest.email, emailPrincipal: true }] : [],
        veiculos: (guest.vehicles || []).map((v: { id: string; placa: string; caracteristica: string | null }) => ({
          id: v.id,
          placaVeiculo: v.placa,
          caractVeic: v.caracteristica || "",
        })),
        ocorrencia: "",
      });
      setShowCadastroHospede(true);
    } catch (err: any) {
      toast.error(err.message || "Erro ao carregar o cadastro do hóspede.");
    } finally {
      setLoadingCadastroHospede(false);
    }
  };

  const handleSaveCadastroHospede = async (data: HospedeFormData) => {
    if (!data.id) return;
    try {
      const res = await fetch(`/api/cadastros/hospedes/${data.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: data.nome,
          cpf: data.cpf || null,
          gender: data.sexo || "M",
          birthDate: data.dtNascimento || null,
          email: data.emails?.[0]?.email || null,
          phone: data.telefones?.[0]?.telefone || null,
          whatsappPhone: data.telefones?.[0]?.telefone || null,
          hasWhatsapp: !!(data.telefones?.[0]?.telefone),
          zipCode: data.cep || null,
          street: data.logradouro || null,
          number: data.numero || null,
          neighborhood: data.bairro || null,
          city: data.cidade || null,
          state: data.uf || null,
          country: data.pais || "Brasil",
          companyId: data.codEmpresa || null,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Falha ao salvar o cadastro do hóspede.");

      await fetch(`/api/cadastros/hospedes/${data.id}/veiculos`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ veiculos: data.veiculos }),
      });

      toast.success("Cadastro do hóspede atualizado com sucesso.");
      setShowCadastroHospede(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar o cadastro do hóspede.");
    }
  };

  const buildReciboPdfBase64 = (paymentsForRecibo: PaymentCreditItem[]) =>
    generateReciboPdfBase64({
      hotelName: hotelName || "HOTEL IDEAL",
      guestName: stayData.primaryGuestName,
      roomNumber: stayData.roomNumber,
      operatorName: activeOperatorName,
      payments: paymentsForRecibo.map((p) => ({
        date: p.date,
        amount: p.amount,
        methodDescription: p.methodDescription,
        operatorName: p.operatorName,
      })),
    });

  const handleSendEmailPaymentReceipt = async (paymentsForRecibo: PaymentCreditItem[]) => {
    if (!sendPaymentConfirmEmailEnabled) {
      toast.warning("O envio de Confirmações de Pagamento por e-mail está desativado nas Configurações da Área do Assinante.");
      return;
    }
    if (paymentsForRecibo.length === 0) return;

    const recipient = await promptDialog({
      title: "Enviar Recibo por E-mail",
      message: "Informe o e-mail do hóspede para envio do recibo de pagamento:",
      placeholder: "hospede@email.com",
      inputType: "email",
      confirmLabel: "Enviar",
      validate: (v) => (!v || !v.includes("@") ? "Informe um e-mail válido." : null),
    });
    if (!recipient) return;

    setSendingEmailPayment(true);
    try {
      const totalValor = paymentsForRecibo.reduce((acc, p) => acc + p.amount, 0);
      const pdfBase64 = buildReciboPdfBase64(paymentsForRecibo);
      const docFilename = `Recibo_Pagamento_Quarto_${stayData.roomNumber}.pdf`;

      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmail: recipient.trim(),
          recipientName: stayData.primaryGuestName,
          documentType: "payment_confirmation",
          subject: `Comprovante de Pagamento - Quarto ${stayData.roomNumber} - ${hotelName}`,
          message: `Confirmamos o recebimento do pagamento no valor de R$ ${totalValor.toFixed(2)} referente ao Quarto ${stayData.roomNumber}. Segue em anexo o recibo em PDF.`,
          pdfBase64,
          filename: docFilename,
          smtpHost: emailSmtpHost,
          smtpPort: emailSmtpPort,
          smtpSecure: emailSmtpSecure,
          smtpUser: emailSmtpUser,
          smtpPass: emailSmtpPass,
          fromName: emailFromName || hotelName,
          fromEmail: emailFromAddress,
          footerText: emailFooterText,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`✓ Recibo de pagamento enviado com sucesso para ${recipient}!`);
      } else {
        toast.error(`Falha no envio: ${data.error || data.message || "Erro no servidor SMTP."}`);
      }
    } catch (err: any) {
      console.error("Erro ao enviar recibo por e-mail:", err);
      toast.error(err.message || "Erro de rede ao enviar e-mail.");
    } finally {
      setSendingEmailPayment(false);
    }
  };

  const handlePrintRecibo = (paymentsForRecibo: PaymentCreditItem[]) => {
    if (paymentsForRecibo.length === 0) return;

    const pdfBase64 = buildReciboPdfBase64(paymentsForRecibo);
    const base64Data = pdfBase64.split(",")[1];
    const byteChars = atob(base64Data);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    iframe.src = url;
    document.body.appendChild(iframe);

    const cleanup = () => {
      if (iframe.parentNode) document.body.removeChild(iframe);
      URL.revokeObjectURL(url);
    };

    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      }, 250);
    };

    setTimeout(cleanup, 60000);
  };

  const handlePrintConsumo = () => {
    const items = stayData.consumptionsDetail || [];
    if (items.length === 0) {
      toast.warning("Nenhum consumo lançado nesta hospedagem.", "Consumo Vazio");
      return;
    }

    const pdfBase64 = generateConsumoPdfBase64({
      hotelName: hotelName || "HOTEL IDEAL",
      guestName: stayData.primaryGuestName,
      roomNumber: stayData.roomNumber,
      items: items.map((i) => ({
        dateTime: i.dateTime,
        description: i.productName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        totalPrice: i.totalPrice,
      })),
    });
    const base64Data = pdfBase64.split(",")[1];
    const byteChars = atob(base64Data);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    iframe.src = url;
    document.body.appendChild(iframe);

    const cleanup = () => {
      if (iframe.parentNode) document.body.removeChild(iframe);
      URL.revokeObjectURL(url);
    };

    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      }, 250);
    };

    setTimeout(cleanup, 60000);
  };

  const handleSendWhatsAppPaymentReceipt = async (paymentsForRecibo: PaymentCreditItem[]) => {
    if (paymentsForRecibo.length === 0) return;

    const phone = await promptDialog({
      title: "Enviar Recibo por WhatsApp",
      message: "Informe o número de WhatsApp do hóspede para envio do recibo de pagamento:",
      placeholder: "63992428861",
      inputType: "tel",
      confirmLabel: "Enviar",
      validate: (v) => (!v || v.replace(/\D/g, "").length < 8 ? "Informe um número de WhatsApp válido." : null),
    });
    if (!phone) return;

    setSendingWhatsappPayment(true);
    try {
      const pdfBase64 = buildReciboPdfBase64(paymentsForRecibo);
      const docFilename = `Recibo_Pagamento_Quarto_${stayData.roomNumber}.pdf`;
      const caption = `Segue anexo o recibo de pagamento do hóspede: ${stayData.primaryGuestName || ""} quarto: ${stayData.roomNumber || ""}`;

      const res = await fetch("/api/uazapi/send-extrato", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim(),
          caption,
          pdfBase64,
          filename: docFilename,
          guestName: stayData.primaryGuestName,
          roomNumber: stayData.roomNumber,
          serverUrl: uazapiServerUrl,
          instanceToken: uazapiInstanceToken,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(data.message || "Recibo enviado com sucesso via WhatsApp!");
      } else {
        toast.error(data.message || "Erro no envio pelo WhatsApp. Verifique se a instância está conectada.");
      }
    } catch (err: any) {
      console.error("Erro ao enviar recibo via WhatsApp:", err);
      toast.error(err.message || "Erro de rede ao enviar via WhatsApp.");
    } finally {
      setSendingWhatsappPayment(false);
    }
  };

  if (!isOpen) return null;

  // Guests List
  const guests: GuestItem[] = stayData.guestsList || [
    { id: "G-1", name: stayData.primaryGuestName || "PEDRO RICARDO DA SILVA FAGUNDES" }
  ];
  const filteredGuests = guests.filter(g =>
    g.name.toLowerCase().includes(guestFilter.toLowerCase())
  );

  // Calculations
  const totalPagamentos = payments.reduce((acc, p) => acc + p.amount, 0);
  const totalDespesas = totalDiarias + totalConsumo + outrosDebitos;
  const saldoAPagar = Math.max(0, totalDespesas - totalPagamentos - desconto);

  // Format Helper
  const fmtCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(val);
  };

  // Add Payment Handler — apenas adiciona à grade local (pendente). Só é gravado no caixa
  // quando o usuário clicar em "Salvar Crédito" (igual ao Table_Pagto do sistema WinDev original).
  const handleAddPayment = () => {
    const cleanValStr = vlrPagto.replace("R$", "").replace(/\./g, "").replace(",", ".").trim();
    const valNum = parseFloat(cleanValStr);

    if (isNaN(valNum) || valNum <= 0) {
      toast.warning("Por favor, informe um valor de pagamento válido maior que zero.", "Valor Inválido");
      return;
    }

    const nowTime = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const newPayment: PaymentCreditItem = {
      id: `PAG-${Date.now()}`,
      date: `${dtPagto || new Date().toLocaleDateString("pt-BR")} ${nowTime}`,
      amount: valNum,
      methodDescription: formaPagamento,
      operatorName: activeOperatorName,
    };

    setPayments(prev => [newPayment, ...prev]);

    // Also append an observation entry
    const newObs: ObservationLog = {
      id: `OBS-${Date.now()}`,
      dateTime: new Date().toLocaleDateString("pt-BR") + " " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      type: "PAGAMENTO",
      user: activeOperatorName,
      note: `Lançamento de ${fmtCurrency(valNum)} em ${formaPagamento} adicionado (pendente até Salvar Crédito).`
    };
    setObservations(prev => [newObs, ...prev]);

    setVlrPagto("0,00");
    toast.info(`Lançamento de ${fmtCurrency(valNum)} (${formaPagamento}) adicionado. Será gravado no caixa ao clicar em "Salvar Crédito".`, "Lançamento Pendente");
  };

  // Remove Payment Handler — se o lançamento já estiver salvo no caixa (tem caixaMovimentoId),
  // a exclusão fica apenas pendente: só é efetivada no banco quando o usuário clicar em
  // "Salvar Crédito" (mesma filosofia "só confirma ao salvar" aplicada às inclusões).
  const handleRemovePayment = async (paymentId: string) => {
    const ok = await confirmDialog({
      title: "Excluir Lançamento",
      message: "Deseja realmente excluir este lançamento de pagamento/crédito?",
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;

    const item = payments.find(p => p.id === paymentId);
    setPayments(prev => prev.filter(p => p.id !== paymentId));

    if (item?.caixaMovimentoId) {
      setPendingDeletions(prev => [...prev, item.caixaMovimentoId!]);
      toast.info('Exclusão pendente — será efetivada no caixa ao clicar em "Salvar Crédito".', "Exclusão Pendente");
    } else {
      toast.info("Lançamento pendente removido da lista.", "Lançamento Removido");
    }
  };

  // Add Observation Handler
  const handleAddObservation = () => {
    if (!newObsText.trim()) return;
    const newObs: ObservationLog = {
      id: `OBS-${Date.now()}`,
      dateTime: new Date().toLocaleDateString("pt-BR") + " " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      type: "RECEPÇÃO",
      user: activeOperatorName,
      note: newObsText.trim()
    };
    setObservations(prev => [newObs, ...prev]);
    setNewObsText("");
    setSelectedObsId(newObs.id);
    toast.info("Observação adicionada com sucesso.", "Observação");
  };

  // Verifica se alguma forma de pagamento lançada nesta hospedagem (já persistida ou recém
  // adicionada) é de Parcelamento (ex.: FATURA) — cobrança que só a empresa faturada aceita se o
  // hóspede tiver assinado o Resumo de Hospedagem impresso no check-out.
  const hasInstallmentPayment = () =>
    payments.some((p) => {
      const pm = paymentMethods.find(
        (m) => m.description.toLowerCase() === p.methodDescription.toLowerCase()
      );
      return !!pm?.installment;
    });

  // Efetiva o check-out, mas antes bloqueia e exige a impressão do Resumo de Hospedagem se houver
  // pagamento por Parcelamento (fatura) — sem a assinatura do hóspede nesse resumo, a empresa
  // faturada não aceita a cobrança.
  const proceedToCheckout = async () => {
    if (hasInstallmentPayment() && !resumoAcknowledgedForSignature) {
      const wantsPrint = await confirmDialog({
        title: "Impressão Obrigatória — Pagamento por Fatura",
        message:
          `Esta hospedagem tem pagamento por FATURA (parcelamento), que a empresa só aceita com a assinatura do hóspede no Resumo de Hospedagem.\n\n` +
          `Imprima o resumo, colha a assinatura do hóspede e clique em "Check-out" novamente para concluir.`,
        confirmLabel: "Imprimir Resumo Agora",
        cancelLabel: "Cancelar",
      });
      if (wantsPrint) {
        setResumoAcknowledgedForSignature(true);
        onOpenResumo?.();
      }
      return;
    }
    onCheckoutConfirmed?.();
    onClose();
  };

  // Save Credit / Check-out Button Handler — grava no caixa, em uma única transação, todos os
  // lançamentos ainda pendentes (adicionados com "+" mas sem caixaMovimentoId), igual ao
  // BTN_FinalizarHospedagem do sistema WinDev original. O que acontece depois de gravar depende
  // do modo: em "payment" a hospedagem NUNCA é encerrada por aqui, mesmo com saldo zerado — esse
  // botão só existe para lançar adiantamentos/pagamentos. Em "checkout" o check-out é efetivado
  // direto (sem perguntar de novo — o usuário já expressou essa intenção ao abrir esta tela pelo
  // duplo-clique no quarto ou pelo item "Encerrar Hospedagem"), e só é bloqueado se ainda houver
  // débito pendente.
  const handleSaveCredit = async () => {
    if (isSaving) return; // evita duplo envio por cliques repetidos enquanto a gravação está em andamento

    const pendingPayments = payments.filter((p) => !p.caixaMovimentoId);
    const discountChanged = desconto !== (stayData.desconto ?? 0.0);

    // Nada foi incluído, excluído ou alterado nesta sessão: não há o que gravar no caixa.
    if (pendingPayments.length === 0 && pendingDeletions.length === 0 && !discountChanged) {
      if (isCheckoutMode) {
        if (saldoAPagar <= 0.001) {
          await proceedToCheckout();
        } else {
          toast.warning(
            `Ainda há saldo devedor de ${fmtCurrency(saldoAPagar)} no Quarto ${stayData.roomNumber}. Quite o débito para concluir o check-out.`,
            "Check-out Não Concluído"
          );
        }
        return;
      }

      toast.info("Nenhuma alteração feita na hospedagem", "Nada a Salvar");
      onClose();
      return;
    }

    setIsSaving(true);
    toast.info("Gravando lançamentos no caixa. Aguarde...", "Salvando Crédito");

    try {
      // Efetiva primeiro as exclusões pendentes (lançamentos antigos removidos pelo usuário nesta sessão)
      if (pendingDeletions.length > 0) {
        const results = await Promise.all(
          pendingDeletions.map((caixaMovimentoId) =>
            fetch("/api/caixa/remover-pagamento", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ caixaMovimentoId, operatorId: activeOperatorId }),
            }).then((r) => r.json())
          )
        );
        const failed = results.find((r) => !r.success);
        if (failed) {
          throw new Error(failed.error || "Falha ao excluir lançamento(s) do caixa.");
        }
        setPendingDeletions([]);
      }

      if (pendingPayments.length > 0 || discountChanged) {
        const res = await fetch("/api/caixa/pagamento-lote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operatorId: activeOperatorId,
            operatorName: activeOperatorName,
            roomId: stayData.roomNumber,
            stayCheckinId: stayData.idHospedagem,
            guestName: stayData.primaryGuestName,
            discount: desconto,
            payments: pendingPayments.map((p) => ({
              clientId: p.id,
              valor: p.amount,
              formaPagamento: p.methodDescription,
              descricao: `Crédito de hospedagem (${p.methodDescription}) - Quarto ${stayData.roomNumber}`,
            })),
          }),
        });
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || "Falha ao gravar lançamentos no caixa.");
        }

        const movimentoByClientId = new Map<string, string>(
          (data.movimentos || []).map((m: { clientId: string; movimentoCaixaId: string }) => [m.clientId, m.movimentoCaixaId])
        );
        setPayments((prev) =>
          prev.map((p) => (movimentoByClientId.has(p.id) ? { ...p, caixaMovimentoId: movimentoByClientId.get(p.id) } : p))
        );
      }
    } catch (e: any) {
      setIsSaving(false);
      toast.error(e.message || "Não foi possível gravar os lançamentos no caixa. Tente novamente.", "Erro ao Salvar");
      return;
    }

    setIsSaving(false);

    if (onSaveSuccess) {
      onSaveSuccess({
        totalPagamentos,
        saldoAPagar,
        payments,
        observations,
      });
    }

    const isQuitado = saldoAPagar <= 0.001;

    if (!isCheckoutMode) {
      // Modo "Lançar Pagamento na Hospedagem": só grava o crédito e nunca oferece/faz check-out,
      // mesmo que o saldo tenha zerado — a hospedagem permanece aberta até o operador encerrá-la
      // explicitamente pelo duplo-clique no quarto ou pelo item "Encerrar Hospedagem".
      toast.success(
        `Crédito de ${fmtCurrency(totalPagamentos)} lançado com sucesso para o Quarto ${stayData.roomNumber}.\n\n` +
        (isQuitado
          ? "Débito da hospedagem quitado. A hospedagem permanece em aberto."
          : `Saldo Restante a Pagar: ${fmtCurrency(saldoAPagar)}\nA hospedagem permanece em aberto (lançado como haver/crédito).`),
        "Crédito Lançado"
      );
      onClose();
      return;
    }

    // Modo "Check-out": débito quitado -> encerra a hospedagem direto (a intenção já foi
    // confirmada ao abrir esta tela). Débito pendente -> salva o pagamento mas NÃO encerra.
    if (isQuitado) {
      await proceedToCheckout();
    } else {
      toast.warning(
        `Pagamento de ${fmtCurrency(totalPagamentos)} registrado, mas ainda há saldo devedor de ${fmtCurrency(saldoAPagar)} no Quarto ${stayData.roomNumber}.\n\n` +
        `Quite o débito para concluir o check-out.`,
        "Check-out Não Concluído"
      );
    }
  };


  const selectedObs = observations.find(o => o.id === selectedObsId) || observations[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-sm overflow-y-auto print:p-0 print:bg-transparent print:static print:block print:overflow-visible">
      {/* Modal Container - WinDev Window Replication */}
      <div
        className={`w-full max-w-5xl rounded-xl border shadow-2xl overflow-hidden flex flex-col my-auto print:hidden ${
          theme.isDark ? "bg-[#0F172A] border-slate-800 text-white" : "bg-[#F4F6F9] border-slate-300 text-slate-900"
        }`}
      >
        {/* Title Bar - WinDev Style */}
        <div className="bg-gradient-to-r from-[#184176] via-[#1E5296] to-[#0284C7] px-4 py-2.5 flex items-center justify-between text-white shadow-md select-none">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-sky-200" />
            <h2 className="font-bold text-sm tracking-wide">
              {isCheckoutMode ? "Check-out / Encerramento de Hospedagem" : "Lançar Pagamento na Hospedagem"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/20 transition-colors text-white"
            title="Fechar (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-4 text-xs overflow-y-auto max-h-[85vh]">
          {/* TOP BAR: Room & Guest Metadata Info */}

          <div className={`p-3 rounded-lg border flex flex-wrap items-center justify-between gap-3 shadow-sm ${
            theme.isDark ? "bg-slate-900/90 border-slate-800" : "bg-white border-slate-200"
          }`}>
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="shrink-0">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Quartos</label>
                <div className="flex items-center gap-1">
                  <span className="font-mono font-extrabold text-sm px-2.5 py-1 rounded bg-[#0284C7] text-white shadow-sm">
                    {stayData.roomNumber}
                  </span>
                </div>
              </div>

              <div className="flex-1 min-w-[380px]">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Nome do Hospede Principal</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    readOnly
                    value={stayData.primaryGuestName || "PEDRO RICARDO DA SILVA FAGUNDES"}
                    className={`w-full font-bold px-2 py-1 rounded border text-xs outline-none ${
                      theme.isDark ? "bg-slate-800 border-slate-700 text-yellow-400" : "bg-yellow-100 border-yellow-300 text-slate-900"
                    }`}
                  />
                  <button
                    onClick={() => openCadastroHospede("dados")}
                    disabled={loadingCadastroHospede}
                    className="p-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white shrink-0 shadow-sm disabled:opacity-60"
                    title="Visualizar/Editar Cadastro do Hóspede"
                  >
                    {loadingCadastroHospede && cadastroHospedeTab === "dados" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => openCadastroHospede("veiculos")}
                    disabled={loadingCadastroHospede}
                    className="p-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white shrink-0 shadow-sm disabled:opacity-60"
                    title="Veículos do Hóspede"
                  >
                    {loadingCadastroHospede && cadastroHospedeTab === "veiculos" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Car className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-[11px]">
              <div>
                <span className="block text-[10px] text-slate-500 font-semibold">Dt.Chegada</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {stayData.checkInDate || "05/02/2026 13:08:42"}
                </span>
              </div>

              <div>
                <span className="block text-[10px] text-slate-500 font-semibold">Dt.Prevista Saida</span>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                  {stayData.expectedCheckOutDate || "08/02/2026 14:00:00"}
                </span>
              </div>

              <div className="text-center">
                <span className="block text-[10px] text-slate-500 font-semibold">Diarias</span>
                <span className="font-mono font-extrabold text-xs px-2 py-0.5 rounded bg-yellow-200 dark:bg-yellow-900/50 text-yellow-900 dark:text-yellow-200 border border-yellow-400/40">
                  {stayData.dailyCount || 3}
                </span>
              </div>

              <div>
                <span className="block text-[10px] text-slate-500 font-semibold">Dt. Saida</span>
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                  {stayData.actualCheckOutDate || new Date().toLocaleDateString("pt-BR") + " " + new Date().toLocaleTimeString("pt-BR")}
                </span>
              </div>

              <div className="text-center">
                <span className="block text-[10px] text-red-500 font-bold uppercase">Extras</span>
                <span className="font-mono font-extrabold text-xs text-red-600 dark:text-red-400">
                  {stayData.extrasCount ?? 0}
                </span>
              </div>
            </div>
          </div>

          {/* MIDDLE TOP: Guests Table (Left) & Resumo da Hospedagem (Right) */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Left: Guests Table */}
            <div className={`md:col-span-6 border rounded-lg overflow-hidden flex flex-col ${
              theme.isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"
            }`}>
              <div className="bg-[#00BCD4] text-white px-3 py-1.5 font-bold text-xs flex items-center justify-between shadow-sm">
                <span>Nome Hospede</span>
                <input
                  type="text"
                  placeholder="Filtrar..."
                  value={guestFilter}
                  onChange={(e) => setGuestFilter(e.target.value)}
                  className="bg-white/20 text-white placeholder-white/70 text-[10px] px-2 py-0.5 rounded outline-none w-24"
                />
              </div>

              <div className="p-1 overflow-y-auto max-h-32 min-h-[100px]">
                <table className="w-full text-left text-[11px] border-collapse">
                  <tbody>
                    {filteredGuests.map((g, idx) => (
                      <tr
                        key={g.id}
                        className={`border-b last:border-b-0 ${
                          idx % 2 === 0
                            ? theme.isDark ? "bg-slate-900/40" : "bg-slate-50"
                            : "bg-transparent"
                        }`}
                      >
                        <td className="p-2 font-semibold flex items-center justify-between">
                          <span>{g.name}</span>
                          {idx === 0 && (
                            <span className="text-[9px] bg-sky-500/20 text-sky-600 dark:text-sky-400 px-1.5 py-0.5 rounded font-bold uppercase">
                              Principal
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right: Resumo da Hospedagem */}
            <div className={`md:col-span-6 border rounded-lg p-3 space-y-3 ${
              theme.isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"
            }`}>
              <div className="flex items-center justify-between border-b pb-1">
                <h3 className="font-bold text-xs text-slate-700 dark:text-slate-200">
                  Resumo da hospedagem:
                </h3>
              </div>

              <div className="grid grid-cols-3 gap-2 text-[11px]">
                {/* Total Diarias */}
                <div>
                  <label className="block text-[10px] font-bold text-red-500 uppercase">Total Diarias (R$)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      readOnly
                      value={fmtCurrency(totalDiarias)}
                      className={`w-full font-mono font-bold text-right p-1 rounded border ${
                        theme.isDark ? "bg-slate-800 border-slate-700 text-yellow-300" : "bg-yellow-50 border-yellow-200 text-slate-900"
                      }`}
                    />
                    <button
                      onClick={() => {
                        if (onOpenExtrato) {
                          onOpenExtrato();
                        } else {
                          toast.info(`Detalhamento de Diárias: ${fmtCurrency(totalDiarias)}`);
                        }
                      }}
                      className="p-1 rounded bg-cyan-600 text-white shrink-0 hover:bg-cyan-500"
                      title="Ver Diárias"
                    >
                      <Eye className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Consumo */}
                <div>
                  <label className="block text-[10px] font-bold text-red-500 uppercase">Consumo(R$)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      readOnly
                      value={fmtCurrency(totalConsumo)}
                      className={`w-full font-mono font-bold text-right p-1 rounded border ${
                        theme.isDark ? "bg-slate-800 border-slate-700 text-yellow-300" : "bg-yellow-50 border-yellow-200 text-slate-900"
                      }`}
                    />
                    <button
                      onClick={() => onOpenConsumo?.()}
                      className="p-1 rounded bg-cyan-600 text-white shrink-0 hover:bg-cyan-500"
                      title="Lançar Consumo"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      onClick={handlePrintConsumo}
                      className="p-1 rounded bg-cyan-700 text-white shrink-0 hover:bg-cyan-600"
                      title="Imprimir Consumo"
                    >
                      <Printer className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Outros Deb. */}
                <div>
                  <label className="block text-[10px] font-bold text-red-500 uppercase">Outros Deb. (R$)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      readOnly
                      value={fmtCurrency(outrosDebitos)}
                      className={`w-full font-mono font-bold text-right p-1 rounded border ${
                        theme.isDark ? "bg-slate-800 border-slate-700 text-yellow-300" : "bg-yellow-50 border-yellow-200 text-slate-900"
                      }`}
                    />
                    <button
                      onClick={() => {
                        if (outrosDebitosDetail.length === 0) {
                          toast.info("Nenhum outro débito lançado nesta hospedagem.", "Outros Débitos");
                          return;
                        }
                        setShowOutrosDebitosModal(true);
                      }}
                      className="p-1 rounded bg-cyan-600 text-white shrink-0 hover:bg-cyan-500"
                      title="Ver Outros Débitos"
                    >
                      <Eye className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {/* Desconto */}
                <div>
                  <label className="block text-[10px] font-bold text-sky-600 dark:text-sky-400 uppercase">Desconto (R$)</label>
                  <input
                    type="number"
                    value={desconto}
                    onChange={(e) => setDesconto(parseFloat(e.target.value) || 0)}
                    className={`w-full font-mono font-bold text-right p-1 rounded border outline-none ${
                      theme.isDark ? "bg-slate-800 border-slate-700 text-white focus:border-sky-400" : "bg-white border-slate-300 text-slate-900 focus:border-sky-500"
                    }`}
                  />
                </div>

                {/* Total Adiant. */}
                <div>
                  <label className="block text-[10px] font-bold text-sky-600 dark:text-sky-400 uppercase">Total Adiant. (R$)</label>
                  <input
                    type="text"
                    readOnly
                    value={fmtCurrency(totalPagamentos)}
                    className={`w-full font-mono font-bold text-right p-1 rounded border ${
                      theme.isDark ? "bg-slate-800 border-slate-700 text-sky-300" : "bg-sky-50 border-sky-200 text-slate-900"
                    }`}
                  />
                </div>
              </div>

              <button
                onClick={() => onOpenResumo?.()}
                className="w-full py-2 px-3 rounded-lg bg-[#00BCD4] hover:bg-cyan-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors"
              >
                <Printer className="w-4 h-4" />
                Imprimir resumo de hospedagem
              </button>
            </div>
          </div>

          {/* MAIN MIDDLE: Pagamentos Form & Table (Left) & Saldo a pagar / Save Button (Right) */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Left: Pagamentos Form & Grid */}
            <div className={`md:col-span-8 border rounded-lg p-3 space-y-3 ${
              theme.isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"
            }`}>
              <h3 className="font-bold text-xs text-slate-700 dark:text-slate-200">
                Pagamentos:
              </h3>

              {/* Form Input Line */}
              <div className="flex flex-wrap items-end gap-2 text-[11px]">
                <div className="w-28">
                  <label className="block text-[10px] font-bold text-slate-500">Dt.Pagto</label>
                  <input
                    type="text"
                    value={dtPagto}
                    onChange={(e) => setDtPagto(e.target.value)}
                    className={`w-full font-mono p-1.5 rounded border outline-none ${
                      theme.isDark ? "bg-slate-800 border-slate-700 text-yellow-300" : "bg-yellow-100 border-yellow-300 text-slate-900"
                    }`}
                  />
                </div>

                <div className="w-32">
                  <label className="block text-[10px] font-bold text-sky-600 dark:text-sky-400">Vlr.Pagto.</label>
                  <input
                    type="text"
                    value={vlrPagto}
                    onChange={(e) => setVlrPagto(e.target.value)}
                    className={`w-full font-mono font-bold text-right p-1.5 rounded border outline-none ${
                      theme.isDark ? "bg-slate-800 border-slate-700 text-yellow-300" : "bg-yellow-100 border-yellow-300 text-slate-900"
                    }`}
                  />
                </div>

                <div className="flex-1 min-w-[180px]">
                  <label className="block text-[10px] font-bold text-slate-500">Forma de Pagamento</label>
                  <select
                    value={formaPagamento}
                    onChange={(e) => setFormaPagamento(e.target.value)}
                    className={`w-full font-bold p-1.5 rounded border outline-none ${
                      theme.isDark ? "bg-slate-800 border-slate-700 text-yellow-300" : "bg-yellow-100 border-yellow-300 text-slate-900"
                    }`}
                  >
                    {paymentMethods.map((m) => (
                      <option key={m.id} value={m.description}>
                        {m.description}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleAddPayment}
                  className="p-2 rounded-lg bg-[#00BCD4] hover:bg-cyan-600 text-white font-bold shrink-0 shadow-sm transition-colors flex items-center justify-center"
                  title="Adicionar Lançamento de Crédito/Pagamento (pendente até Salvar Crédito)"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Payments Grid Table */}
              <div className="border rounded overflow-hidden max-h-40 overflow-y-auto">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-[#00BCD4] text-white font-bold select-none">
                      <th className="p-1.5 border-r border-cyan-400/50">Data/Hora</th>
                      <th className="p-1.5 border-r border-cyan-400/50 text-right">Valor Adiant.</th>
                      <th className="p-1.5 border-r border-cyan-400/50">Descr.Form.Pagto</th>
                      <th className="p-1.5 border-r border-cyan-400/50">Operador</th>
                      <th className="p-1.5 border-r border-cyan-400/50 text-center w-16">Imprimir</th>
                      <th className="p-1.5 text-center w-12">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-3 text-center text-slate-400 italic">
                          Nenhum pagamento ou crédito lançado ainda nesta hospedagem.
                        </td>
                      </tr>
                    ) : (
                      payments.map((p, idx) => (
                        <tr
                          key={p.id}
                          onDoubleClick={() => handleRemovePayment(p.id)}
                          className={`border-b last:border-b-0 cursor-pointer transition-colors ${
                            idx % 2 === 0
                              ? theme.isDark ? "bg-slate-900/40 hover:bg-slate-800" : "bg-slate-50 hover:bg-sky-50"
                              : theme.isDark ? "hover:bg-slate-800" : "hover:bg-sky-50"
                          }`}
                          title="Duplo clique para excluir este lançamento"
                        >
                          <td className="p-1.5 font-mono">{p.date}</td>
                          <td className="p-1.5 font-mono font-bold text-right text-emerald-600 dark:text-emerald-400">
                            {fmtCurrency(p.amount)}
                          </td>
                          <td className="p-1.5 font-bold uppercase">{p.methodDescription}</td>
                          <td className="p-1.5 font-medium uppercase text-slate-500 dark:text-slate-400">{p.operatorName || "—"}</td>
                          <td className="p-1.5 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setReciboPayments([p]);
                                setShowReciboModal(true);
                              }}
                              className="text-cyan-600 hover:text-cyan-800 p-0.5 rounded hover:bg-cyan-100 dark:hover:bg-cyan-950/40"
                              title="Imprimir recibo deste lançamento"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                          </td>
                          <td className="p-1.5 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemovePayment(p.id);
                              }}
                              className="text-red-500 hover:text-red-700 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-950/40"
                              title="Excluir lançamento"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Bottom Payments Action & Hint */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  onClick={() => {
                    if (payments.length > 0) {
                      setReciboPayments(payments);
                      setShowReciboModal(true);
                    } else {
                      toast.warning("Nenhum pagamento registrado para emitir recibo.");
                    }
                  }}
                  className="py-1.5 px-3 rounded-lg bg-[#00BCD4] hover:bg-cyan-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  Imprimir Recibo (Todos os Lançamentos)
                </button>

                <p className="text-[10px] text-red-500 italic font-semibold">
                  *Para excluir um lançamento clica duas vezes com o botao esquerdo no mouse em cima do lançamento.
                </p>
              </div>
            </div>

            {/* Right: Salvar Crédito & Financial Summary */}
            <div className="md:col-span-4 flex flex-col justify-between space-y-4">
              <div className={`border rounded-lg p-3 space-y-3 ${
                theme.isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"
              }`}>
                <div>
                  <label className="block text-[10px] font-bold text-sky-600 dark:text-sky-400 uppercase">
                    Total de Pagamentos (R$)
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={fmtCurrency(totalPagamentos)}
                    className={`w-full font-mono font-bold text-right p-1.5 rounded border text-sm ${
                      theme.isDark ? "bg-slate-800 border-slate-700 text-yellow-300" : "bg-yellow-100 border-yellow-200 text-slate-900"
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-sky-600 dark:text-sky-400 uppercase">
                    Desconto (R$)
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={fmtCurrency(desconto)}
                    className={`w-full font-mono font-bold text-right p-1.5 rounded border text-sm ${
                      theme.isDark ? "bg-slate-800 border-slate-700 text-yellow-300" : "bg-yellow-100 border-yellow-200 text-slate-900"
                    }`}
                  />
                </div>
              </div>

              {/* Saldo a pagar (R$) Yellow Box - WinDev Focal Point */}
              <div className="space-y-2">
                <h4 className="font-extrabold text-sm text-blue-700 dark:text-blue-400">
                  Saldo a pagar (R$)
                </h4>
                <div className="bg-yellow-300 dark:bg-yellow-400/90 text-red-600 font-extrabold text-2xl p-3 rounded-lg text-right shadow-inner font-mono border-2 border-yellow-400">
                  {fmtCurrency(saldoAPagar)}
                </div>

                <button
                  onClick={handleSaveCredit}
                  disabled={isSaving}
                  title={isSaving ? "Gravando no caixa... Aguarde" : isCheckoutMode ? "Fazer Check-out" : "Salvar Crédito"}
                  className="w-full py-3 px-4 rounded-xl bg-[#00BCD4] hover:bg-cyan-600 text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-lg transition-all transform active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : isCheckoutMode ? (
                    <LogOut className="w-6 h-6 stroke-[3]" />
                  ) : (
                    <Check className="w-6 h-6 stroke-[3]" />
                  )}
                  {isSaving ? "Gravando... Aguarde" : isCheckoutMode ? "Check-out" : "Salvar Crédito"}
                </button>
              </div>
            </div>
          </div>

          {/* BOTTOM SECTION: Observações */}
          <div className={`border rounded-lg p-3 space-y-2 ${
            theme.isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"
          }`}>
            <h3 className="font-bold text-xs text-slate-700 dark:text-slate-200">
              Observações:
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {/* Obs Table (Left) */}
              <div className="md:col-span-7 border rounded overflow-hidden max-h-36 overflow-y-auto">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-[#00BCD4] text-white font-bold select-none">
                      <th className="p-1.5 border-r border-cyan-400/50">Data/Hora</th>
                      <th className="p-1.5 border-r border-cyan-400/50">Tipo</th>
                      <th className="p-1.5">Usuario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {observations.map((obs, idx) => (
                      <tr
                        key={obs.id}
                        onClick={() => setSelectedObsId(obs.id)}
                        className={`border-b last:border-b-0 cursor-pointer ${
                          selectedObsId === obs.id
                            ? "bg-sky-500/20 font-bold"
                            : idx % 2 === 0
                              ? theme.isDark ? "bg-slate-900/40" : "bg-slate-50"
                              : ""
                        }`}
                      >
                        <td className="p-1.5 font-mono">{obs.dateTime}</td>
                        <td className="p-1.5 font-bold uppercase">{obs.type}</td>
                        <td className="p-1.5 uppercase">{obs.user}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Obs Text Display & New Input (Right) */}
              <div className="md:col-span-5 flex flex-col space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Observação Selecionada / Nova</label>
                <textarea
                  rows={3}
                  value={newObsText || (selectedObs ? selectedObs.note : "")}
                  onChange={(e) => setNewObsText(e.target.value)}
                  placeholder="Digite uma nova observação para este lançamento..."
                  className={`w-full p-2 text-xs rounded border outline-none resize-none ${
                    theme.isDark ? "bg-slate-800 border-slate-700 text-white focus:border-sky-400" : "bg-white border-slate-300 text-slate-900 focus:border-sky-500"
                  }`}
                />
                {newObsText.trim() && (
                  <button
                    onClick={handleAddObservation}
                    className="self-end px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center gap-1 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar Observação
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* QUICK MODAL 1: RECIBO DE PAGAMENTO */}
      {showReciboModal && reciboPayments.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm print:p-0 print:bg-transparent print:static print:block">
          <div className={`w-full max-w-md p-6 rounded-2xl border shadow-2xl space-y-4 print:p-0 print:border-none print:shadow-none print:bg-white print:text-black print:max-w-none print:w-full ${
            theme.isDark ? "bg-[#0F172A] border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"
          }`}>
            <div className="flex items-center justify-between border-b pb-3 print:hidden">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Printer className="w-5 h-5 text-cyan-500" /> Recibo de Pagamento / Adiantamento
              </h3>
              <button onClick={() => setShowReciboModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900 border rounded-xl space-y-3 text-xs font-mono print:bg-white print:text-black print:border-slate-400 print:p-0">
              <div className="text-center font-bold border-b pb-2 text-slate-700 dark:text-slate-200 print:text-black">
                {hotelName || "POUSADA SOL & MAR"}
                <br />
                <span className="text-[10px] font-normal text-slate-500 print:text-slate-700">COMPROVANTE DE CRÉDITO DE HOSPEDAGEM</span>
              </div>

              <div className="space-y-1 text-slate-700 dark:text-slate-200 print:text-black">
                <div>Quarto: <strong className="text-sky-500 print:text-black">{stayData.roomNumber}</strong></div>
                <div>Hóspede: <strong>{stayData.primaryGuestName}</strong></div>

                {reciboPayments.length === 1 ? (
                  <>
                    <div>Data Lançamento: {reciboPayments[0].date}</div>
                    <div>Forma de Pagto: <strong className="uppercase">{reciboPayments[0].methodDescription}</strong></div>
                    {reciboPayments[0].operatorName && (
                      <div>Operador: <strong className="uppercase">{reciboPayments[0].operatorName}</strong></div>
                    )}
                  </>
                ) : (
                  <div className="space-y-1 border-y py-1.5">
                    {reciboPayments.map((p) => (
                      <div key={p.id} className="flex justify-between gap-2">
                        <span className="truncate">{p.date} — {p.methodDescription}</span>
                        <span className="font-bold shrink-0">{fmtCurrency(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 print:text-black pt-1 border-t">
                  Valor {reciboPayments.length > 1 ? "Total" : "Pago"}: {fmtCurrency(reciboPayments.reduce((acc, p) => acc + p.amount, 0))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 print:hidden">
              <button
                onClick={() => setShowReciboModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                Fechar
              </button>
              <button
                onClick={() => handleSendWhatsAppPaymentReceipt(reciboPayments)}
                disabled={sendingWhatsappPayment}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-md disabled:opacity-50"
              >
                {sendingWhatsappPayment ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <MessageSquare className="w-4 h-4" /> Enviar por WhatsApp
                  </>
                )}
              </button>
              <button
                onClick={() => handleSendEmailPaymentReceipt(reciboPayments)}
                disabled={sendingEmailPayment}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1.5 shadow-md disabled:opacity-50"
              >
                {sendingEmailPayment ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4" /> Enviar por E-mail
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  handlePrintRecibo(reciboPayments);
                  setShowReciboModal(false);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5 shadow-md"
              >
                <Printer className="w-4 h-4" /> Imprimir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUICK MODAL: DETALHAMENTO DE OUTROS DÉBITOS (origem das transferências recebidas) */}
      {showOutrosDebitosModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className={`w-full max-w-lg p-5 rounded-2xl border shadow-2xl space-y-4 ${
            theme.isDark ? "bg-[#0F172A] border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"
          }`}>
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-cyan-500" /> Outros Débitos — Origem dos Lançamentos
              </h3>
              <button onClick={() => setShowOutrosDebitosModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="border rounded overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead>
                  <tr className="bg-[#00BCD4] text-white font-bold select-none">
                    <th className="p-1.5 border-r border-cyan-400/50">Data/Hora</th>
                    <th className="p-1.5 border-r border-cyan-400/50">Quarto Origem</th>
                    <th className="p-1.5 border-r border-cyan-400/50">Hóspede Origem</th>
                    <th className="p-1.5 border-r border-cyan-400/50">Operador</th>
                    <th className="p-1.5 text-right">Valor (R$)</th>
                  </tr>
                </thead>
                <tbody>
                  {outrosDebitosDetail.map((d, idx) => (
                    <tr
                      key={d.id}
                      className={`border-b last:border-b-0 ${
                        idx % 2 === 0 ? (theme.isDark ? "bg-slate-900/40" : "bg-slate-50") : ""
                      }`}
                    >
                      <td className="p-1.5 font-mono">{new Date(d.createdAt).toLocaleString("pt-BR")}</td>
                      <td className="p-1.5 font-bold">{d.fromRoomNumber}</td>
                      <td className="p-1.5 uppercase">{d.fromGuestName}</td>
                      <td className="p-1.5 uppercase text-slate-500 dark:text-slate-400">{d.operatorName || "—"}</td>
                      <td className="p-1.5 font-mono font-bold text-right text-red-600 dark:text-red-400">{fmtCurrency(d.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-bold text-slate-500 uppercase">Total de Outros Débitos</span>
              <span className="text-base font-extrabold text-red-600 dark:text-red-400 font-mono">{fmtCurrency(outrosDebitos)}</span>
            </div>

            <button
              onClick={() => setShowOutrosDebitosModal(false)}
              className="w-full py-2 px-3 rounded-xl text-xs font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* CADASTRO DO HÓSPEDE (Visualizar/Editar dados ou Veículos) */}
      <CadastroHospedeModal
        isOpen={showCadastroHospede}
        onClose={() => setShowCadastroHospede(false)}
        onSave={handleSaveCadastroHospede}
        initialData={cadastroHospedeData}
        initialTab={cadastroHospedeTab}
        readOnly={cadastroHospedeReadOnly}
      />

    </div>
  );
}
