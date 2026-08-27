"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { 
  BedDouble, 
  UserCheck, 
  CalendarPlus, 
  FileCheck, 
  CheckCircle2, 
  Clock, 
  Wrench, 
  Sparkles, 
  Building2, 
  Check, 
  User,
  Search,
  ChevronRight,
  MoreVertical,
  Calendar,
  CreditCard,
  Printer,
  LogOut as LogOutIcon,
  MessageSquare,
  Wine,
  FileText,
  RefreshCw,
  Cpu,
  ArrowRightLeft,
  DollarSign,
  AlertCircle,
  AlertTriangle,
  CalendarCheck,
  Eye,
  EyeOff,
  X,
  Percent,
  DoorClosed
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import AlterarPeriodoModal from "@/components/AlterarPeriodoModal";

import AlterarTarifaHospedagemModal from "@/components/AlterarTarifaHospedagemModal";
import CadastroTarifasModal, { INITIAL_TARIFFS, TariffItem } from "@/components/CadastroTarifasModal";
import CheckinHospedagemModal from "@/components/CheckinHospedagemModal";
import CheckinCelebrationOverlay from "@/components/CheckinCelebrationOverlay";
import CheckoutFarewellOverlay from "@/components/CheckoutFarewellOverlay";
import { ImprimirExtratoHospedagemModal, TariffPeriodItem } from "@/components/ImprimirExtratoHospedagemModal";
import { ImprimirResumoHospedagemModal } from "@/components/ImprimirResumoHospedagemModal";
import { MensagensWhatsAppModal } from "@/components/MensagensWhatsAppModal";
import { playWhatsappNotificationSound } from "@/utils/notificationSound";
import LancarConsumoQuartoModal from "@/components/LancarConsumoQuartoModal";
import LancarPagamentoHospedagemModal from "@/components/LancarPagamentoHospedagemModal";
import LancarReservaModal from "@/components/LancarReservaModal";
import TransferenciaDebitoModal from "@/components/TransferenciaDebitoModal";
import HistoricoLimpezaModal from "@/components/HistoricoLimpezaModal";
import SelecaoReservaQuartoModal, { ReservaItemQuarto } from "@/components/SelecaoReservaQuartoModal";
import LoadingOverlay from "@/components/LoadingOverlay";

// Converte "DD/MM/YYYY HH:MM:SS" (formato usado pelo modal de check-in) para ISO "YYYY-MM-DDTHH:MM:SS",
// formato exigido pela coluna timestamp do Postgres na API /api/reservations.
function brDateTimeToIso(brStr: string): string {
  if (!brStr) return brStr;
  const [datePart, timePart] = brStr.split(" ");
  if (!datePart || !datePart.includes("/")) return brStr;
  const [dd, mm, yyyy] = datePart.split("/");
  return `${yyyy}-${mm}-${dd}T${timePart || "00:00:00"}`;
}

// Converte um ISO/timestamp do banco para "DD/MM/YYYY HH:MM:SS", formato usado nos modais de Extrato/Resumo.
function formatDdMmYyyy(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  if (!year || !month || !day) return dateStr;
  return `${day}/${month}/${year}`;
}

function formatBrDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

interface RoomItem {
  id: string;
  number: string;
  category: string;
  floor: string;
  status: "VACANT_CLEAN" | "OCCUPIED" | "OCCUPIED_CLEANING" | "VACANT_DIRTY" | "MAINTENANCE";
  guest: string | null;
  dates: string;
  expectedCheckOutDate?: string | null;
  notes?: string;
  maintenanceUntil?: string;
  fnrh?: boolean;
  corporate?: string | null;
  uazapiSent?: boolean;
  governess?: string;
  active?: boolean;
  ratePerNight?: number;
  totalConsumption?: number;
  unreadWhatsappCount?: number;
}

type FilterType = "ALL" | "VACANT_CLEAN" | "OCCUPIED" | "CLEANING" | "MAINTENANCE" | "CHECKOUT_TODAY";

export default function TenantDashboardPage() {
  const { theme, hotelLogo, hotelName, showLogoInPrint, whatsappSoundEnabled } = useTheme();
  const toast = useToast();

  // Modals & Action States

  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [showConsumptionModal, setShowConsumptionModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showExtratoModal, setShowExtratoModal] = useState(false);
  const [showResumoModal, setShowResumoModal] = useState(false);
  const [activeStayDetail, setActiveStayDetail] = useState<{
    id: string;
    checkInDate: string;
    expectedCheckOut: string;
    actualCheckOut: string | null;
    totalDaily: number;
    totalConsumption: number;
    discount: number;
    dailiesCount: number;
    extraDailiesCount: number;
    totalAdvance: number;
    balanceDue: number;
    otherDebits: number;
    otherDebitsDetail: { id: string; amount: number; createdAt: string; fromRoomNumber: string; fromGuestName: string; operatorName: string | null }[];
    dailyCharges: { referenceDate: string; amount: number; description: string }[];
    guest: { id: string; fullName: string; cpf: string | null; phone: string | null; whatsappPhone: string | null; city: string | null; state: string | null; street: string | null; neighborhood: string | null; zipCode: string | null };
    secondaryGuests: { id: string; name: string; document: string | null }[];
    consumptions: {
      id: string;
      productId: string | null;
      productName: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      posLocationId: string | null;
      posLocationName: string | null;
      operatorName: string | null;
      createdAt: string;
    }[];
  } | null>(null);
  const [activeStayPayments, setActiveStayPayments] = useState<{ id: string; date: string; amount: number; methodDescription: string; operatorName?: string; caixaMovimentoId: string }[]>([]);
  // Descrições (uppercase) das formas de pagamento cadastradas como Parcelamento (ex.: FATURA) —
  // usado para separar, no Resumo de Hospedagem impresso no check-out, o que foi pago de fato do
  // que foi faturado para a empresa (exige assinatura do hóspede, ver LancarPagamentoHospedagemModal).
  const [installmentPaymentMethodNames, setInstallmentPaymentMethodNames] = useState<Set<string>>(new Set());
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/cadastros/formas-pagamento");
        const data = await res.json();
        if (!data?.success || !Array.isArray(data.paymentMethods)) return;
        setInstallmentPaymentMethodNames(
          new Set(
            data.paymentMethods
              .filter((f: any) => f.installment)
              .map((f: any) => String(f.description).toUpperCase())
          )
        );
      } catch (err) {
        console.warn("[Mapa de Quartos] Erro ao buscar formas de pagamento:", err);
      }
    })();
  }, []);
  // Reservas futuras (ainda não check-in) do quarto em edição no Alterar Período — usado para
  // bloquear no calendário datas que colidiriam com uma reserva já confirmada para o mesmo quarto.
  const [activeRoomReservations, setActiveRoomReservations] = useState<{ id: string; guestName: string; roomNumber: string; checkInDate: string; checkOutDate: string }[]>([]);
  const [showAutomationModal, setShowAutomationModal] = useState(false);
  const [showWppModal, setShowWppModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [showAlterarPeriodoModal, setShowAlterarPeriodoModal] = useState(false);
  const [showAlterarTarifaModal, setShowAlterarTarifaModal] = useState(false);
  const [showCadastroTarifasModal, setShowCadastroTarifasModal] = useState(false);
  const [showLancarPagamentoModal, setShowLancarPagamentoModal] = useState(false);
  // "payment": lança pagamentos/adiantamentos na hospedagem sem nunca fechar a conta (botão fixo
  // em "Salvar Crédito"). "checkout": única forma de efetivamente encerrar a hospedagem — exige
  // débito zerado (ou quitado no ato) e libera o quarto. Nunca misturar os dois no mesmo botão.
  const [lancarPagamentoMode, setLancarPagamentoMode] = useState<"payment" | "checkout">("payment");
  const [showTransferDebitoModal, setShowTransferDebitoModal] = useState(false);
  const [showHistoricoLimpezaModal, setShowHistoricoLimpezaModal] = useState(false);
  const [showLancarReservaModal, setShowLancarReservaModal] = useState(false);
  // Check-in via reserva
  const [showSelecaoReservaModal, setShowSelecaoReservaModal] = useState(false);
  const [selectedRoomForReserva, setSelectedRoomForReserva] = useState<string>("101");
  // Reservas carregadas da API para o quarto selecionado no modal de seleção
  const [selecaoReservaList, setSelecaoReservaList] = useState<ReservaItemQuarto[]>([]);
  const [selecaoReservaLoading, setSelecaoReservaLoading] = useState(false);
  // Reserva selecionada para prosseguir com check-in
  const [reservaParaCheckin, setReservaParaCheckin] = useState<ReservaItemQuarto | null>(null);
  // Reserva selecionada para edição completa (duplo clique na lista de reservas do quarto)
  const [reservaParaEditar, setReservaParaEditar] = useState<ReservaItemQuarto | null>(null);
  const [selectedTariffForCheckin, setSelectedTariffForCheckin] = useState<TariffItem>(INITIAL_TARIFFS[2]);


  const [activeRoom, setActiveRoom] = useState<RoomItem | null>(null);
  const lastFetchedRoomNumberRef = useRef<string | null>(null);
  // true enquanto a busca abaixo está em voo. Extrato/Resumo/WhatsApp tiram um snapshot único dos
  // dados na abertura (nunca sobrescrito por um refresh em segundo plano, para não estragar um
  // documento já em exibição/impressão) — então, se activeStayDetail já estava carregado de uma
  // tela anterior (ex.: Lançar Pagamento aberta por baixo) e esses modais forem abertos por cima
  // ANTES do refetch iniciado por essa própria abertura terminar, eles tirariam o snapshot com os
  // dados antigos (ex.: sem o pagamento que acabou de ser salvo) e nunca mais atualizariam. Usado
  // para manter a tela de carregamento visível até o refetch terminar, garantindo que esses modais
  // só montem (e tirem o snapshot) com os dados já atualizados.
  const [isLoadingStayModal, setIsLoadingStayModal] = useState(false);
  const [targetRoomNumber, setTargetRoomNumber] = useState<string>("101");
  const [showInactive, setShowInactive] = useState(false);

  const [maintenanceUntilInput, setMaintenanceUntilInput] = useState("20/08/2026 18:00");
  const [maintenanceNotesInput, setMaintenanceNotesInput] = useState("OS #402 Manutenção Geral");
  const [isSettingMaintenance, setIsSettingMaintenance] = useState(false);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    room: RoomItem | null;
  }>({ visible: false, x: 0, y: 0, room: null });

  // Filter and Search States
  const [statusFilter, setStatusFilter] = useState<FilterType>("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [floorFilter, setFloorFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  // ─── Reservas do Dia (para sinais visuais de overbooking) ───────────────────
  // Chave: número do quarto (string), Valor: lista de reservas ativas para hoje
  const [todayReservationsByRoom, setTodayReservationsByRoom] = useState<Record<string, {
    id?: string;
    guestName: string;
    checkInTime: string;
    reservationNumber?: string;
  }[]>>({});

  // Room List State
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  // Indica que a primeira busca dos quartos no banco ainda está em andamento — usado para
  // exibir um aviso tipo "toast" informando o usuário do que está acontecendo em segundo plano,
  // já que essa busca inicial tem um pequeno delay natural.
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);

  // Animação de boas-vindas exibida no card do quarto logo após um check-in ser confirmado
  // (id do quarto atualmente em celebração + nome do hóspede para a mensagem final)
  const [checkinCelebrationRoomId, setCheckinCelebrationRoomId] = useState<string | null>(null);
  const [checkinCelebrationGuest, setCheckinCelebrationGuest] = useState("");

  // Animação de despedida exibida no card do quarto logo após um check-out ser confirmado
  const [checkoutFarewellRoomId, setCheckoutFarewellRoomId] = useState<string | null>(null);

  // Selo visual "em limpeza" — tarefas de governança em andamento (IN_PROGRESS), indexadas por
  // roomId. Cobre os dois tipos: CHECKOUT (limpeza profunda pós check-out) e OCCUPIED (arrumação
  // com hóspede no quarto). Some automaticamente quando a governanta conclui a limpeza no app dela.
  const [housekeepingByRoomId, setHousekeepingByRoomId] = useState<Record<string, {
    type: "CHECKOUT" | "OCCUPIED";
    housekeeperName: string | null;
  }>>({});

  // Quartos cuja arrumação de hoje foi marcada como "não perturbe" pela governanta (modo Fila de
  // quartos). Selo informativo no card — zera na virada do dia.
  const [dndTodayRoomIds, setDndTodayRoomIds] = useState<Set<string>>(new Set());

  // Sincronização automática e transparente a partir do banco de dados (sem piscamento de tela)
  const syncRoomsFromDatabase = useCallback(async () => {
    try {
      const [res, housekeepingRes] = await Promise.all([
        fetch(`/api/reservations/rooms/status`),
        fetch(`/api/tenant/housekeeping-tasks`).catch(() => null),
      ]);

      if (housekeepingRes) {
        const housekeepingData = await housekeepingRes.json().catch(() => null);
        if (housekeepingData?.success && Array.isArray(housekeepingData.tasks)) {
          const map: Record<string, { type: "CHECKOUT" | "OCCUPIED"; housekeeperName: string | null }> = {};
          for (const t of housekeepingData.tasks) {
            if (t.status === "IN_PROGRESS") {
              map[t.roomId] = { type: t.type, housekeeperName: t.housekeeper?.name || null };
            }
          }
          setHousekeepingByRoomId(map);

          const dndIds: string[] = Array.isArray(housekeepingData.dndTodayRoomIds)
            ? housekeepingData.dndTodayRoomIds
            : [];
          setDndTodayRoomIds((prev) => {
            const next = new Set(dndIds);
            if (prev.size === next.size && [...prev].every((id) => next.has(id))) return prev;
            return next;
          });
        }
      }

      const data = await res.json();
      if (!data || !data.success || !Array.isArray(data.rooms)) return;

      // Reservas que chegam hoje (selos de overbooking / "próximo check-in") — agora vêm junto
      // com o polling de 3s, então a badge aparece/some sozinha quando outro terminal faz o
      // check-in, cancela ou remarca a reserva. Antes era buscado uma única vez no carregamento
      // da tela e nunca mais atualizava.
      if (Array.isArray(data.todayReservations)) {
        const byRoom: Record<string, { id?: string; guestName: string; checkInTime: string; reservationNumber?: string }[]> = {};
        for (const r of data.todayReservations) {
          const roomNum = String(r.roomNumber ?? "");
          if (!roomNum) continue;
          if (!byRoom[roomNum]) byRoom[roomNum] = [];
          byRoom[roomNum].push({
            id: r.id,
            guestName: r.guestName || "Hóspede",
            checkInTime: r.checkInTime || "14:00",
            reservationNumber: r.reservationNumber || r.id,
          });
        }
        // Só troca o estado (e re-renderiza) quando o conjunto de reservas de hoje realmente muda —
        // o polling roda a cada 3s e na esmagadora maioria dos ciclos nada mudou.
        setTodayReservationsByRoom((prev) => {
          const next = JSON.stringify(byRoom);
          return next === JSON.stringify(prev) ? prev : byRoom;
        });
      }

      setRooms((prevRooms) => {
        const prevMap = new Map(prevRooms.map((r) => [r.number, r]));

        const updatedList: RoomItem[] = data.rooms.map((r: any) => {
          const roomNum = String(r.number);
          const existing = prevMap.get(roomNum);
          const isActive = r.active !== false;

          const dbStatus = r.status || "VACANT_CLEAN";
          const dbNotes = r.notes || "Quarto Higienizado & Vistoriado";
          const dbCategory = r.category || r.room_categories?.name || "Standard";
          const dbFloor = r.floor || "Térreo";

          // Hospedagem ativa vem do banco (tabela stay_checkins) — é a fonte da verdade,
          // não o estado local do navegador, que se perde ao recarregar a página.
          const activeStay = r.activeStay;
          const dbGuest = dbStatus === "VACANT_CLEAN" ? null : activeStay?.guestName ?? null;
          const dbConsumption = activeStay ? activeStay.totalConsumption : 0;
          const dbUnreadWhatsapp = activeStay?.unreadWhatsappCount ?? 0;
          const dbDates =
            dbStatus === "VACANT_CLEAN"
              ? "Disponível para Check-in"
              : activeStay?.expectedCheckOut
              ? `Check-out: ${new Date(activeStay.expectedCheckOut).toLocaleDateString("pt-BR")}`
              : dbStatus === "VACANT_DIRTY" || dbStatus === "OCCUPIED_CLEANING"
              ? "Aguardando Limpeza"
              : "Disponível";
          const dbExpectedCheckOutDate =
            dbStatus === "VACANT_CLEAN" || !activeStay?.expectedCheckOut
              ? null
              : String(activeStay.expectedCheckOut).split("T")[0];

          if (existing) {
            // Manter a mesma referência de objeto se nada mudou para garantir ZERO piscamento na UI
            if (
              existing.status === dbStatus &&
              existing.active === isActive &&
              existing.category === dbCategory &&
              existing.floor === dbFloor &&
              existing.notes === dbNotes &&
              existing.guest === dbGuest &&
              existing.totalConsumption === dbConsumption &&
              existing.dates === dbDates &&
              existing.expectedCheckOutDate === dbExpectedCheckOutDate &&
              (existing.unreadWhatsappCount || 0) === dbUnreadWhatsapp
            ) {
              return existing;
            }

            return {
              ...existing,
              status: dbStatus,
              category: dbCategory,
              floor: dbFloor,
              notes: dbNotes,
              active: isActive,
              dates: dbDates,
              expectedCheckOutDate: dbExpectedCheckOutDate,
              guest: dbGuest,
              totalConsumption: dbConsumption,
              unreadWhatsappCount: dbUnreadWhatsapp,
            };
          }

          return {
            id: r.id,
            number: roomNum,
            category: dbCategory,
            floor: dbFloor,
            status: dbStatus,
            guest: dbGuest,
            dates: dbDates,
            expectedCheckOutDate: dbExpectedCheckOutDate,
            notes: dbNotes,
            active: isActive,
            ratePerNight: r.ratePerNight || 180,
            totalConsumption: dbConsumption,
            unreadWhatsappCount: dbUnreadWhatsapp,
          };
        });

        // Toca o sinal sonoro quando o total de mensagens não lidas do hotel (somando todos os
        // quartos) aumenta em relação ao ciclo anterior de polling — indica que chegou mensagem
        // nova de algum hóspede enquanto a tela de conversa daquele quarto não estava aberta.
        const prevUnreadTotal = prevRooms.reduce((acc, r) => acc + (r.unreadWhatsappCount || 0), 0);
        const newUnreadTotal = updatedList.reduce((acc, r) => acc + (r.unreadWhatsappCount || 0), 0);
        if (newUnreadTotal > prevUnreadTotal && whatsappSoundEnabled) {
          playWhatsappNotificationSound();
        }

        return updatedList;
      });
    } catch (err) {
      console.warn("[MapaQuartos] Erro na sincronização transparente:", err);
    } finally {
      setIsLoadingRooms(false);
    }
  }, [whatsappSoundEnabled]);

  // A atualização automática (polling) é exclusiva das telas de Mapa de Quartos e Mapa de
  // Reservas. Assim como no projeto original em WinDev, ao abrir qualquer janela/modal por cima
  // (extrato, resumo, consumo, check-in, transferência, etc.) a atualização automática deve
  // pausar, para não sobrescrever dados que o operador esteja vendo ou digitando naquela tela.
  const anyModalOpen =
    showCheckinModal ||
    showConsumptionModal ||
    showStatusModal ||
    showPrintModal ||
    showExtratoModal ||
    showResumoModal ||
    showAutomationModal ||
    showWppModal ||
    showTransferModal ||
    showNotesModal ||
    showAlterarPeriodoModal ||
    showAlterarTarifaModal ||
    showCadastroTarifasModal ||
    showLancarPagamentoModal ||
    showTransferDebitoModal ||
    showLancarReservaModal ||
    showSelecaoReservaModal;

  // Polling em segundo plano a cada 3 segundos — pausado enquanto qualquer modal estiver aberto
  useEffect(() => {
    if (anyModalOpen) return;
    syncRoomsFromDatabase();
    const interval = setInterval(syncRoomsFromDatabase, 3000);
    return () => clearInterval(interval);
  }, [syncRoomsFromDatabase, anyModalOpen]);

  // Espelha anyModalOpen num ref para ser lido dentro do intervalo de diária extra abaixo, sem
  // precisar reiniciar esse intervalo toda vez que um modal abre/fecha.
  const anyModalOpenRef = useRef(anyModalOpen);
  useEffect(() => { anyModalOpenRef.current = anyModalOpen; }, [anyModalOpen]);

  // Verificação automática de diária extra por checkout atrasado: a cada 1 minuto, checa todos os
  // quartos ocupados e, se a data/hora atual já ultrapassou o horário de virada de diária configurado
  // em Configurações (Tenant.dailyRolloverTime), lança +1 diária extra no débito da hospedagem
  // (idempotente por dia). O horário limite é sempre decidido pelo servidor a partir do Tenant —
  // nunca a partir de um valor local do navegador, para não ficar dessincronizado de Configurações.
  useEffect(() => {
    const checkLateCheckoutRollover = async () => {
      try {
        const res = await fetch("/api/stay/rollover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId: "tenant-hoteisnet-demo" }),
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.rolledOver) && data.rolledOver.length > 0) {
          for (const item of data.rolledOver) {
            toast.info(
              `Quarto ${item.roomNumber}: horário de virada de diária atingido. ${item.daysAdded} diária(s) extra lançada(s) (R$ ${item.amountAdded.toFixed(2)}).`,
              "Diária Extra Lançada"
            );
          }
          // A cobrança da diária extra já foi gravada no backend independentemente do modal aberto
          // (o horário de virada não pode esperar o operador fechar a tela) — mas o redesenho do
          // card do quarto por baixo de um modal aberto é adiado, para não violar a regra de
          // pausar a atualização automática enquanto o operador está com uma tela aberta.
          if (!anyModalOpenRef.current) {
            syncRoomsFromDatabase();
          }
        }
      } catch (err) {
        console.warn("[MapaQuartos] Erro na verificação de diária extra por checkout atrasado:", err);
      }
    };

    checkLateCheckoutRollover();
    const rolloverInterval = setInterval(checkLateCheckoutRollover, 60000);
    return () => clearInterval(rolloverInterval);
  }, [syncRoomsFromDatabase]);

  // As "Reservas do Dia" (selos visuais de overbooking / próximos check-ins) agora são atualizadas
  // dentro de syncRoomsFromDatabase, no mesmo polling de 3s do Mapa de Quartos — ver
  // /api/reservations/rooms/status. Não há mais busca única no carregamento da tela, que ficava
  // desatualizada quando outro terminal fazia o check-in / cancelava a reserva.

  // Close context menu on outside click
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.visible) setContextMenu(prev => ({ ...prev, visible: false }));
    };
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, [contextMenu.visible]);

  // Busca a hospedagem ativa real do quarto ao abrir Extrato/Resumo/Pagamento/Alterar Tarifa/Alterar Período/Consumo — evita usar dados de amostra
  useEffect(() => {
    if ((showExtratoModal || showResumoModal || showLancarPagamentoModal || showAlterarTarifaModal || showAlterarPeriodoModal || showConsumptionModal || showTransferDebitoModal || showWppModal) && activeRoom) {
      // Não zera activeStayDetail/activeStayPayments quando é o MESMO quarto já carregado (ex.: Consumo
      // aberto por cima do modal de Pagamento) — zerar desmontaria o modal em edição. Mas ao TROCAR de
      // quarto (ex.: fechar Extrato do 217 e abrir do 220) é preciso zerar antes de buscar: senão o
      // modal (que tira um snapshot único dos dados na abertura) renderiza de imediato com os dados
      // antigos do quarto anterior, que nunca são substituídos pelos do quarto novo quando a busca termina.
      if (activeStayDetail && lastFetchedRoomNumberRef.current !== activeRoom.number) {
        setActiveStayDetail(null);
        setActiveStayPayments([]);
      }
      lastFetchedRoomNumberRef.current = activeRoom.number;
      setIsLoadingStayModal(true);
      (async () => {
        try {
          // Alterar Período depende da diária do dia já estar lançada (ou não) para calcular a
          // data mínima de saída permitida — força a checagem de virada de diária no servidor
          // antes de buscar a hospedagem, em vez de confiar no polling de 1 em 1 minuto que pode
          // estar até 60s desatualizado no exato momento em que o usuário abre o modal.
          if (showAlterarPeriodoModal) {
            try {
              await fetch("/api/stay/rollover", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tenantId: "tenant-hoteisnet-demo" }),
              });
            } catch {
              // segue com os dados que já existirem se a checagem de virada falhar
            }
          }

          const res = await fetch(`/api/stay/checkin?roomNumber=${activeRoom.number}&tenantId=tenant-hoteisnet-demo`);
          const data = await res.json();

          if (!data.success) {
            toast.error(data.error || "Hospedagem ativa não encontrada para este quarto.", "Erro ao Carregar Hospedagem");
            setShowExtratoModal(false);
            setShowResumoModal(false);
            setShowLancarPagamentoModal(false);
            setShowAlterarTarifaModal(false);
            setShowAlterarPeriodoModal(false);
            setShowConsumptionModal(false);
            setShowTransferDebitoModal(false);
            setShowWppModal(false);
            return;
          }

          // Busca os pagamentos já lançados ANTES de liberar o modal — evita que ele monte
          // com a lista de pagamentos ainda vazia (o estado interno do modal só lê o valor inicial uma vez).
          let payments: typeof activeStayPayments = [];
          if (showLancarPagamentoModal || showAlterarTarifaModal || showConsumptionModal || showExtratoModal || showResumoModal) {
            try {
              const contaRes = await fetch(`/api/caixa/conta-quarto?stayCheckinId=${data.stay.id}`);
              const contaData = await contaRes.json();
              if (contaData.success) payments = contaData.payments || [];
            } catch {
              // segue sem histórico de pagamentos se o caixa não responder
            }
          }

          // Reservas futuras do mesmo quarto — necessário para o Alterar Período bloquear no
          // calendário datas que colidiriam com uma reserva já confirmada. Ignora canceladas e as
          // que já viraram a própria hospedagem em curso (CHECKED_IN) ou já encerradas (CHECKED_OUT).
          if (showAlterarPeriodoModal) {
            try {
              const reservasRes = await fetch(`/api/reservations?tenantId=TNT-01`);
              const reservasData = await reservasRes.json();
              if (reservasData.success && Array.isArray(reservasData.reservations)) {
                const roomReservas = reservasData.reservations
                  .filter((r: any) => {
                    if (["CANCELLED", "CHECKED_IN", "CHECKED_OUT"].includes(r.status)) return false;
                    const roomNum = r.rooms?.number ? String(r.rooms.number) : (r.roomDescription?.match(/\d+/)?.[0] || "");
                    return roomNum === activeRoom.number;
                  })
                  .map((r: any) => ({
                    id: r.id,
                    guestName: r.guestName || "Hóspede",
                    roomNumber: activeRoom.number,
                    checkInDate: (r.checkInDate || "").split("T")[0],
                    checkOutDate: (r.checkOutDate || "").split("T")[0],
                  }));
                setActiveRoomReservations(roomReservas);
              }
            } catch {
              // segue sem checagem de conflito de reserva se a busca falhar
              setActiveRoomReservations([]);
            }
          }

          setActiveStayPayments(payments);
          setActiveStayDetail(data.stay);
        } catch (err) {
          console.warn("[Extrato/Resumo/Pagamento/Tarifa/Consumo] Erro ao buscar hospedagem ativa:", err);
          toast.error("Não foi possível carregar os dados da hospedagem.", "Erro ao Carregar Hospedagem");
          setShowExtratoModal(false);
          setShowResumoModal(false);
          setShowLancarPagamentoModal(false);
          setShowAlterarTarifaModal(false);
          setShowAlterarPeriodoModal(false);
          setShowConsumptionModal(false);
          setShowTransferDebitoModal(false);
          setShowWppModal(false);
        } finally {
          setIsLoadingStayModal(false);
        }
      })();
    }
  }, [showExtratoModal, showResumoModal, showLancarPagamentoModal, showAlterarTarifaModal, showAlterarPeriodoModal, showConsumptionModal, showTransferDebitoModal, showWppModal, activeRoom]);

  const handleOpenContextMenu = (e: React.MouseEvent, room: RoomItem) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveRoom(room);
    setContextMenu({
      visible: true,
      x: Math.min(e.clientX, window.innerWidth - 280),
      y: Math.min(e.clientY, window.innerHeight - 450),
      room,
    });
  };

  // Abre o modal de seleção de reserva buscando dados reais da API
  const openSelecaoReservaModal = async (room: RoomItem) => {
    setActiveRoom(room);
    setSelectedRoomForReserva(room.number);
    setSelecaoReservaList([]);
    setSelecaoReservaLoading(true);
    setShowSelecaoReservaModal(true);

    try {
      const res = await fetch(`/api/reservations?tenantId=TNT-01`);
      const data = await res.json();
      if (data.success && Array.isArray(data.reservations)) {
        // Filtrar reservas do quarto específico (ativas/confirmadas)
        const roomReservations: ReservaItemQuarto[] = data.reservations
          .filter((r: any) => {
            if (r.status === "CANCELLED") return false;
            const roomNum = r.rooms?.number ? String(r.rooms.number) : (r.roomDescription?.match(/\d+/)?.[0] || "");
            return roomNum === room.number;
          })
          .map((r: any) => ({
            id: r.id,
            reservationNumber: r.reservationNumber || r.id,
            roomNumber: room.number,
            guestName: (r.guestName || "HÓSPEDE").toUpperCase(),
            cpf: r.guestCpf || r.cpf || "",
            phone: r.guestPhone || r.phone || "",
            checkInDate: `${formatDdMmYyyy((r.checkInDate || "").split("T")[0])} ${r.checkInTime || "14:00"}`,
            checkOutDate: `${formatDdMmYyyy((r.checkOutDate || "").split("T")[0])} ${r.checkOutTime || "12:00"}`,
            checkInTime: r.checkInTime || "14:00",
            checkOutTime: r.checkOutTime || "12:00",
            checkOutDateRaw: (r.checkOutDate || "").split("T")[0],
            checkInDateRaw: (r.checkInDate || "").split("T")[0],
            status: r.status || "CONFIRMADA",
            totalAmount: parseFloat(r.totalAmount || 0),
            depositPaid: parseFloat(r.depositPaid || 0),
            dailyRate: parseFloat(r.dailyRate || 0),
            tariffName: r.tariffName || "Tarifa Padrão",
            company: r.company || undefined,
            notes: r.notes || undefined,
            precheckinSent: r.preCheckinSent || false,
            fnrhCompleted: r.fnrhCompleted || false,
          }));
        setSelecaoReservaList(roomReservations);
      }
    } catch (err) {
      console.error("[openSelecaoReservaModal] Erro ao buscar reservas:", err);
    } finally {
      setSelecaoReservaLoading(false);
    }
  };

  // Data de hoje (YYYY-MM-DD) para o filtro "Check-out Hoje"
  const todayDateStr = new Date().toISOString().split("T")[0];

  // Status Counters
  const counts = {
    ALL: rooms.filter(r => showInactive || r.active !== false).length,
    VACANT_CLEAN: rooms.filter(r => (showInactive || r.active !== false) && r.status === "VACANT_CLEAN").length,
    OCCUPIED: rooms.filter(r => (showInactive || r.active !== false) && (r.status === "OCCUPIED" || r.status === "OCCUPIED_CLEANING")).length,
    CLEANING: rooms.filter(r => (showInactive || r.active !== false) && (r.status === "VACANT_DIRTY" || r.status === "OCCUPIED_CLEANING")).length,
    MAINTENANCE: rooms.filter(r => (showInactive || r.active !== false) && r.status === "MAINTENANCE").length,
    CHECKOUT_TODAY: rooms.filter(r => (showInactive || r.active !== false) && r.expectedCheckOutDate === todayDateStr).length,
    INACTIVE: rooms.filter(r => r.active === false).length,
  };

  // Taxa de ocupação atual do hotel: ocupados / total de quartos ativos (independe do
  // filtro "Inativos" da UI). Mesma definição usada no snapshot horário salvo pelo worker
  // (ver apps/worker/src/occupancySnapshot.ts) para o histórico de vacância.
  const activeRoomsCount = rooms.filter(r => r.active !== false).length;
  const occupiedActiveRoomsCount = rooms.filter(r => r.active !== false && (r.status === "OCCUPIED" || r.status === "OCCUPIED_CLEANING")).length;
  const occupancyRate = activeRoomsCount > 0 ? (occupiedActiveRoomsCount / activeRoomsCount) * 100 : 0;

  // Listas de andares e categorias presentes nos quartos cadastrados, para o sub-filtro
  const availableFloors = useMemo(
    () => Array.from(new Set(rooms.map(r => r.floor).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [rooms]
  );
  const availableCategories = useMemo(
    () => Array.from(new Set(rooms.map(r => r.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [rooms]
  );

  // Filtered rooms logic
  const filteredRooms = rooms.filter(room => {
    if (!showInactive && room.active === false) return false;

    let matchesStatus = true;
    if (statusFilter === "VACANT_CLEAN") matchesStatus = room.status === "VACANT_CLEAN";
    else if (statusFilter === "OCCUPIED") matchesStatus = room.status === "OCCUPIED" || room.status === "OCCUPIED_CLEANING";
    else if (statusFilter === "CLEANING") matchesStatus = room.status === "VACANT_DIRTY" || room.status === "OCCUPIED_CLEANING";
    else if (statusFilter === "MAINTENANCE") matchesStatus = room.status === "MAINTENANCE";
    else if (statusFilter === "CHECKOUT_TODAY") matchesStatus = room.expectedCheckOutDate === todayDateStr;

    const matchesFloor = floorFilter === "ALL" || room.floor === floorFilter;
    const matchesCategory = categoryFilter === "ALL" || room.category === categoryFilter;

    const query = searchTerm.toLowerCase().trim();
    const matchesSearch = !query ||
      room.number.toLowerCase().includes(query) ||
      room.category.toLowerCase().includes(query) ||
      (room.guest && room.guest.toLowerCase().includes(query));

    return matchesStatus && matchesFloor && matchesCategory && matchesSearch;
  });

  // Monta os dados reais de Extrato/Resumo a partir da hospedagem ativa buscada no banco.
  // Observação: a quebra de diárias abaixo é 1 linha por pernoite à tarifa contratada — não reproduz
  // eventuais regras de tolerância/proporcionalidade de checkout tardio definidas no sistema WinDev original.
  const realStayBilling = useMemo(() => {
    if (!activeStayDetail) return null;

    const checkIn = new Date(activeStayDetail.checkInDate);
    const expectedCheckOut = new Date(activeStayDetail.expectedCheckOut);
    const msPerNight = 24 * 60 * 60 * 1000;

    // A grade de diárias deve refletir exatamente o que foi lançado na conta (StayCharge "Diária",
    // criada no check-in e a cada virada de diária/rollover) — não uma contagem recalculada por
    // diferença de datas, que pode ficar dessincronizada do que já foi cobrado de fato.
    const tariffList: TariffPeriodItem[] = activeStayDetail.dailyCharges.length > 0
      ? activeStayDetail.dailyCharges.map((charge) => {
          const start = new Date(charge.referenceDate);
          const end = new Date(start.getTime() + msPerNight);
          return {
            description: charge.description || "Diária",
            startDate: formatBrDateTime(start.toISOString()).split(" ")[0],
            endDate: formatBrDateTime(end.toISOString()).split(" ")[0],
            dailyRate: charge.amount,
            referenceDateISO: start.toISOString(),
          };
        })
      : [{
          description: "DIÁRIA",
          startDate: formatBrDateTime(checkIn.toISOString()).split(" ")[0],
          endDate: formatBrDateTime(new Date(checkIn.getTime() + msPerNight).toISOString()).split(" ")[0],
          dailyRate: activeStayDetail.totalDaily,
          referenceDateISO: checkIn.toISOString(),
        }];

    const nights = Math.max(1, tariffList.length);

    // Diárias extras = diárias realmente lançadas (nights, já respeitando o horário de virada
    // configurado em Tenant.dailyRolloverTime — ver /api/stay/rollover) além das diárias originalmente
    // reservadas (diferença entre check-in e a saída prevista). Nunca recalculado por diferença de
    // datas/horas no front, que ignorava o horário de virada e gerava diárias extras precoces.
    const reservedNights = Math.max(1, Math.round((expectedCheckOut.getTime() - checkIn.getTime()) / msPerNight));
    const extraDays = Math.max(0, nights - reservedNights);

    const totalDiarias = activeStayDetail.totalDaily;
    const totalConsumo = activeStayDetail.totalConsumption;
    const outrosDebitos = activeStayDetail.otherDebits ?? 0;
    const discount = activeStayDetail.discount ?? 0;
    const totalAdiantamento = activeStayPayments.reduce((acc, p) => acc + p.amount, 0);
    // Separa o que foi efetivamente pago do que foi faturado para a empresa (forma de pagamento
    // com Parcelamento, ex.: FATURA) — o Resumo de Hospedagem impresso no check-out precisa exibir
    // os dois totais separadamente, nunca somados como se tudo fosse pagamento recebido.
    const totalFaturado = activeStayPayments
      .filter((p) => installmentPaymentMethodNames.has(p.methodDescription.toUpperCase()))
      .reduce((acc, p) => acc + p.amount, 0);
    const totalPago = totalAdiantamento - totalFaturado;
    const totalDespesas = totalDiarias + totalConsumo + outrosDebitos;

    return {
      guestName: activeStayDetail.guest.fullName,
      cpf: activeStayDetail.guest.cpf || "",
      phone: activeStayDetail.guest.whatsappPhone || activeStayDetail.guest.phone || "",
      cep: activeStayDetail.guest.zipCode || "",
      neighborhood: activeStayDetail.guest.neighborhood || "",
      address: [activeStayDetail.guest.street, activeStayDetail.guest.city, activeStayDetail.guest.state].filter(Boolean).join(", "),
      city: activeStayDetail.guest.city || "",
      uf: activeStayDetail.guest.state || "",
      checkInDate: formatBrDateTime(activeStayDetail.checkInDate),
      prevCheckOutDate: formatBrDateTime(activeStayDetail.expectedCheckOut),
      actualCheckOutDate: activeStayDetail.actualCheckOut ? formatBrDateTime(activeStayDetail.actualCheckOut) : formatBrDateTime(new Date().toISOString()),
      nights,
      extraDays,
      tariffList,
      allGuests: [
        { id: "primary", name: activeStayDetail.guest.fullName, isPrimary: true },
        ...activeStayDetail.secondaryGuests.map((g) => ({ id: g.id, name: g.name })),
      ],
      consumptionList: activeStayDetail.consumptions.map((c, idx) => ({
        itemNumber: idx + 1,
        description: c.productName,
        date: formatBrDateTime(c.createdAt),
        quantity: c.quantity,
        unitPrice: c.unitPrice,
        totalPrice: c.totalPrice,
        operatorName: c.operatorName,
        posLocationName: c.posLocationName,
      })),
      totalDiarias,
      totalConsumo,
      outrosDebitos,
      outrosDebitosDetail: activeStayDetail.otherDebitsDetail || [],
      totalDespesas,
      discount,
      totalAdiantamento,
      totalPago,
      totalFaturado,
    };
  }, [activeStayDetail, activeStayPayments, installmentPaymentMethodNames]);

  // Quartos elegíveis como destino na Transferência de Débitos: ocupados, com hóspede, exceto o
  // próprio quarto de origem (o menu que abre o modal já garante que a origem está ocupada).
  const transferDestinationOptions = useMemo(() => {
    return rooms
      .filter(r => (r.status === "OCCUPIED" || r.status === "OCCUPIED_CLEANING") && r.guest && r.number !== activeRoom?.number)
      .map(r => ({ number: r.number, guestName: r.guest as string }));
  }, [rooms, activeRoom]);

  const filterTabs = [
    {
      id: "ALL" as FilterType,
      label: "Todos os Quartos",
      count: counts.ALL,
      icon: <BedDouble className="w-4 h-4" />,
      activeClass: "bg-[#0284C7] text-white border-[#0284C7]",
      badgeActiveClass: "bg-white/20 text-white"
    },
    {
      id: "VACANT_CLEAN" as FilterType,
      label: "Livres / Limpos",
      count: counts.VACANT_CLEAN,
      icon: <CheckCircle2 className="w-4 h-4 text-[#10B981]" />,
      activeClass: "bg-[#10B981] text-white border-[#10B981]",
      badgeActiveClass: "bg-white/20 text-white"
    },
    {
      id: "OCCUPIED" as FilterType,
      label: "Ocupados",
      count: counts.OCCUPIED,
      icon: <User className="w-4 h-4 text-[#38BDF8]" />,
      activeClass: "bg-[#0284C7] text-white border-[#0284C7]",
      badgeActiveClass: "bg-white/20 text-white"
    },
    {
      id: "CLEANING" as FilterType,
      label: "Em Limpeza / Checkout",
      count: counts.CLEANING,
      icon: <Clock className="w-4 h-4 text-[#EAB308]" />,
      activeClass: "bg-[#EAB308] text-slate-950 border-[#EAB308]",
      badgeActiveClass: "bg-slate-950/20 text-slate-950 font-bold"
    },
    {
      id: "MAINTENANCE" as FilterType,
      label: "Manutenção",
      count: counts.MAINTENANCE,
      icon: <Wrench className="w-4 h-4 text-rose-500" />,
      activeClass: "bg-rose-700 text-white border-rose-600",
      badgeActiveClass: "bg-rose-950/40 text-rose-200"
    },
    {
      id: "CHECKOUT_TODAY" as FilterType,
      label: "Check-out Hoje",
      count: counts.CHECKOUT_TODAY,
      icon: <CalendarCheck className="w-4 h-4 text-[#F97316]" />,
      activeClass: "bg-[#F97316] text-white border-[#F97316]",
      badgeActiveClass: "bg-white/20 text-white"
    },
  ];

  return (
    <div className="space-y-6 pb-12 relative">
      {/* Aviso informando que os quartos estão sendo buscados no banco de dados (primeira carga) */}
      <LoadingOverlay show={isLoadingRooms} message="Buscando quartos..." submessage="Estamos carregando as informações mais recentes do hotel." />

      {/* Main SaaS Page View Container (Hidden when printing reports) */}
      <div className="space-y-6 print:hidden">
        {/* Top Header & Search Bar */}
        <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl border shadow-xl ${theme.bgCard}`}>
          <div className="flex items-center gap-3">
            <div 
              style={{ backgroundColor: theme.primaryColor }}
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shrink-0 text-xl"
            >
              {hotelName ? hotelName.charAt(0) : "H"}
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                Mapa Operacional de Acomodações
              </h1>
              <p className={`text-xs ${theme.textMuted}`}>
                {hotelName} • Clique com o botão direito em um quarto para acessar o menu completo de funções.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Taxa de Ocupação Atual */}
            <div
              title="Ocupados / total de quartos ativos"
              className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 ${
                theme.isDark
                  ? "bg-slate-900 border-slate-700 text-slate-200"
                  : "bg-slate-100 border-slate-300 text-slate-700"
              }`}
            >
              <Percent className="w-3.5 h-3.5" style={{ color: theme.primaryColor }} />
              Taxa de Ocupação:{" "}
              <span style={{ color: theme.primaryColor }} className="font-bold">
                {occupancyRate.toFixed(1)}%
              </span>
            </div>

            {/* Search Box */}
            <div className="relative">
              <Search className={`w-4 h-4 absolute left-3 top-3 ${theme.textMuted}`} />
              <input
                type="text"
                placeholder="Buscar por quarto, hóspede..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`border rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-[#34598F] w-64 ${
                  theme.isDark 
                    ? "bg-slate-900 border-slate-700 text-white placeholder-slate-500" 
                    : "bg-slate-100 border-slate-300 text-slate-900 placeholder-slate-400"
                }`}
              />
            </div>

            {/* Toggle Inactive Filter */}
            <button
              onClick={() => setShowInactive(!showInactive)}
              className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                showInactive 
                  ? "bg-red-950/60 border-red-800 text-red-300" 
                  : theme.isDark
                    ? "bg-slate-900 border-slate-700 text-slate-400 hover:text-white"
                    : "bg-slate-100 border-slate-300 text-slate-700 hover:text-slate-900"
              }`}
            >
              {showInactive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              Inativos ({counts.INACTIVE})
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className={`flex flex-wrap items-center gap-2 border-b pb-3 ${theme.borderColor}`}>
          {filterTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 border ${
                statusFilter === tab.id
                  ? tab.activeClass
                  : theme.isDark
                    ? "bg-[#0F172A] text-slate-400 hover:text-white border-slate-800 hover:bg-slate-800/60"
                    : "bg-white text-slate-700 hover:text-slate-900 border-slate-200 hover:bg-slate-100 shadow-sm"
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                statusFilter === tab.id 
                  ? tab.badgeActiveClass 
                  : theme.isDark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-700 border border-slate-200"
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Sub-filtro por Andar e Categoria */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <label className={`text-[11px] font-semibold ${theme.textMuted}`}>Andar:</label>
            <select
              value={floorFilter}
              onChange={(e) => setFloorFilter(e.target.value)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold focus:outline-none border ${
                theme.isDark
                  ? "bg-[#0F172A] border-slate-800 text-slate-200"
                  : "bg-white border-slate-200 text-slate-700 shadow-sm"
              }`}
            >
              <option value="ALL">Todos os Andares</option>
              {availableFloors.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <label className={`text-[11px] font-semibold ${theme.textMuted}`}>Categoria:</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold focus:outline-none border ${
                theme.isDark
                  ? "bg-[#0F172A] border-slate-800 text-slate-200"
                  : "bg-white border-slate-200 text-slate-700 shadow-sm"
              }`}
            >
              <option value="ALL">Todas as Categorias</option>
              {availableCategories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {(floorFilter !== "ALL" || categoryFilter !== "ALL") && (
            <button
              onClick={() => { setFloorFilter("ALL"); setCategoryFilter("ALL"); }}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold border flex items-center gap-1 transition ${
                theme.isDark ? "border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800" : "border-slate-300 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <X className="w-3 h-3" /> Limpar sub-filtro
            </button>
          )}

          <span className={`text-[11px] font-mono ml-auto ${theme.textMuted}`}>
            {filteredRooms.length} quarto(s) encontrado(s)
          </span>
        </div>

        {/* Room Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredRooms.map(room => {
            const isOccupied = room.status === "OCCUPIED" || room.status === "OCCUPIED_CLEANING";
            const isCleaning = room.status === "VACANT_DIRTY" || room.status === "OCCUPIED_CLEANING";
            const isMaintenance = room.status === "MAINTENANCE";
            const isVacantClean = room.status === "VACANT_CLEAN";
            const isInactive = room.active === false;

            // Reservas do dia para este quarto (sinal de overbooking)
            const todayResForRoom = todayReservationsByRoom[room.number] || [];
            const hasTodayReservation = todayResForRoom.length > 0;
            const firstTodayRes = hasTodayReservation ? todayResForRoom[0] : null;

            let cardBg = theme.isDark ? "bg-[#0F172A] border-slate-800" : "bg-white border-slate-200 shadow-sm";
            let badgeBg = theme.isDark ? "bg-slate-800 text-slate-300 border-slate-700" : "bg-slate-200 text-slate-800 border-slate-300";
            let statusText = "Livre / Limpo";

            if (isInactive) {
              cardBg = "bg-red-950/10 border-red-900/40 opacity-70";
              badgeBg = "bg-red-500/20 text-red-400 border-red-500/30";
              statusText = "DESATIVADO";
            } else if (isOccupied) {
              cardBg = theme.isDark ? "bg-[#0284C7]/5 border-[#0284C7]/40" : "bg-sky-50/70 border-sky-300 shadow-sm";
              badgeBg = "bg-[#184176] text-white border-[#184176] font-bold";
              statusText = "Ocupado";
            } else if (isCleaning) {
              cardBg = theme.isDark ? "bg-[#EAB308]/5 border-[#EAB308]/40" : "bg-amber-50/70 border-amber-300 shadow-sm";
              badgeBg = "bg-[#D97706] text-white border-[#D97706] font-bold";
              statusText = room.status === "OCCUPIED_CLEANING" ? "Limpeza c/ Hóspede" : "Checkout / Limpeza";
            } else if (isMaintenance) {
              cardBg = theme.isDark ? "bg-rose-950/20 border-rose-800/60" : "bg-rose-50 border-rose-300 shadow-sm";
              badgeBg = "bg-rose-700 text-white border-rose-700 font-bold";
              statusText = "Manutenção";
            } else if (isVacantClean) {
              cardBg = theme.isDark ? "bg-[#10B981]/5 border-[#10B981]/40" : "bg-emerald-50/70 border-emerald-300 shadow-sm";
              badgeBg = "bg-emerald-600 text-white border-emerald-600 font-bold";
              statusText = "Livre / Higienizado";
            }

            return (
              <div
                key={room.id}
                onContextMenu={(e) => handleOpenContextMenu(e, room)}
                onDoubleClick={() => {
                  if (isInactive || isMaintenance) return;
                  if (isOccupied) {
                    // Quarto ocupado: abre a tela de check-out (fechamento de conta) com os dados da hospedagem.
                    // Duplo-clique é uma das duas únicas formas de encerrar a hospedagem (a outra é o item
                    // "Encerrar Hospedagem" do menu de contexto) — por isso sempre abre em modo "checkout".
                    setActiveRoom(room);
                    setLancarPagamentoMode("checkout");
                    setShowLancarPagamentoModal(true);
                  } else if (isVacantClean) {
                    // Quarto livre: abre a tela de check-in com os dados do quarto
                    if (hasTodayReservation) {
                      openSelecaoReservaModal(room);
                    } else {
                      setActiveRoom(room);
                      setTargetRoomNumber(room.number);
                      setShowCheckinModal(true);
                    }
                  }
                }}
                className={`group relative p-5 rounded-2xl border ${
                  // Borda pulsante extra quando há reserva hoje + quarto ocupado ou em manutenção
                  hasTodayReservation && (isOccupied || isMaintenance)
                    ? "ring-2 ring-offset-1 " + (isMaintenance ? "ring-red-500 ring-offset-slate-950" : "ring-red-500/70 ring-offset-slate-950")
                    : ""
                } ${cardBg} shadow-lg transition-all duration-200 hover:border-slate-400 flex flex-col justify-between space-y-4`}
              >

                {/* 🎉 ANIMAÇÃO DE CHECK-IN: casal feliz entrando/se acomodando no quarto */}
                {checkinCelebrationRoomId === room.id && (
                  <CheckinCelebrationOverlay
                    guestName={checkinCelebrationGuest}
                    onFinished={() =>
                      setCheckinCelebrationRoomId((prev) => (prev === room.id ? null : prev))
                    }
                  />
                )}

                {/* 👋 ANIMAÇÃO DE CHECK-OUT: casal deixando o quarto, feliz com a estadia */}
                {checkoutFarewellRoomId === room.id && (
                  <CheckoutFarewellOverlay
                    roomNumber={room.number}
                    onFinished={() =>
                      setCheckoutFarewellRoomId((prev) => (prev === room.id ? null : prev))
                    }
                  />
                )}

                {/* ⚠️ BANNER DE ALERTA: RESERVA PARA O DIA */}
                {hasTodayReservation && (
                  <div className={`absolute -top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold shadow-lg border whitespace-nowrap ${
                    isMaintenance
                      ? "bg-red-600 text-white border-red-400 animate-pulse shadow-red-600/40 shadow-xl"
                      : isOccupied
                      ? "bg-red-600 text-white border-red-400 animate-pulse shadow-red-600/40 shadow-xl"
                      : isCleaning && !isOccupied
                      ? "bg-orange-500 text-white border-orange-400 shadow-orange-500/40 shadow-md"
                      : "bg-emerald-700 text-white border-emerald-500 shadow-emerald-700/30 shadow-sm"
                  }`}>
                    {isMaintenance ? (
                      <><AlertTriangle className="w-3 h-3 shrink-0" /> MANUÇÃO + RESERVA HOJE!</>
                    ) : isOccupied ? (
                      <><AlertTriangle className="w-3 h-3 shrink-0" /> OCUPADO + RESERVA HOJE!</>
                    ) : isCleaning && !isOccupied ? (
                      <><CalendarCheck className="w-3 h-3 shrink-0" /> LIMPEZA + RESERVA HOJE</>  
                    ) : (
                      <><CalendarCheck className="w-3 h-3 shrink-0" /> RESERVA HOJE {firstTodayRes?.checkInTime}</>
                    )}
                  </div>
                )}

                {/* 🧹 SELO: LIMPEZA EM ANDAMENTO (governança) — some quando a governanta conclui pelo app.
                    Fica no rodapé-direita para não colidir com o banner "RESERVA HOJE" (topo-centro). */}
                {housekeepingByRoomId[room.id] && (
                  <div className={`absolute -bottom-3 right-3 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold shadow-lg border whitespace-nowrap animate-pulse ${
                    housekeepingByRoomId[room.id].type === "OCCUPIED"
                      ? "bg-violet-600 text-white border-violet-400 shadow-violet-600/40"
                      : "bg-amber-500 text-white border-amber-300 shadow-amber-500/40"
                  }`}>
                    <Sparkles className="w-3 h-3 shrink-0" />
                    {housekeepingByRoomId[room.id].type === "OCCUPIED" ? "Arrumação c/ hóspede" : "Em limpeza"}
                    {housekeepingByRoomId[room.id].housekeeperName ? ` — ${housekeepingByRoomId[room.id].housekeeperName}` : ""}
                  </div>
                )}

                {/* 🚪 SELO: HÓSPEDE EM "NÃO PERTURBE" HOJE — registrado pela governanta no app dela.
                    Mesmo canto do selo de limpeza (rodapé-direita); os dois nunca aparecem juntos. */}
                {!housekeepingByRoomId[room.id] && dndTodayRoomIds.has(room.id) && (
                  <div className="absolute -bottom-3 right-3 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold shadow-lg border whitespace-nowrap bg-slate-700 text-amber-200 border-amber-400/50">
                    <DoorClosed className="w-3 h-3 shrink-0" />
                    Não perturbe hoje
                  </div>
                )}

                {/* Top Header Card */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div
                      style={{ backgroundColor: isVacantClean ? "#10B981" : isOccupied ? "#184176" : isCleaning ? "#D97706" : isMaintenance ? "#BE123C" : "#475569" }}
                      className="w-11 h-11 rounded-xl text-white font-mono font-bold flex items-center justify-center text-lg shadow-md shrink-0"
                    >
                      {room.number}
                    </div>
                    <div>
                      <h3 className={`font-bold text-sm tracking-tight ${theme.textMain}`}>{room.category}</h3>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] border ${badgeBg}`}>
                        {statusText}
                      </span>
                    </div>
                  </div>

                  {/* Quick Action Dots */}
                  <div className="relative flex items-center gap-1">
                    {(room.unreadWhatsappCount || 0) > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveRoom(room);
                          setShowWppModal(true);
                        }}
                        title={`${room.unreadWhatsappCount} mensagem(ns) não lida(s) do hóspede`}
                        className="relative p-1.5 rounded-lg bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25 transition-colors animate-pulse"
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-emerald-600 text-white text-[9px] font-bold flex items-center justify-center">
                          {room.unreadWhatsappCount}
                        </span>
                      </button>
                    )}
                    <button
                      onClick={(e) => handleOpenContextMenu(e, room)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        theme.isDark ? "hover:bg-slate-800 text-slate-400" : "hover:bg-slate-100 text-slate-600"
                      }`}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Guest & Stay Details */}
                {isMaintenance ? (
                  <div className={`p-3 rounded-xl border space-y-2 text-xs ${
                    theme.isDark ? "bg-rose-950/40 border-rose-900/60" : "bg-rose-100 border-rose-300"
                  }`}>
                    <div className="flex items-center justify-between font-medium">
                      <span className="flex items-center gap-1.5 text-rose-600 font-semibold">
                        <Wrench className="w-3.5 h-3.5" /> Quarto em Manutenção
                      </span>
                    </div>
                    <div className={`flex items-center justify-between text-[11px] pt-1.5 border-t ${theme.borderColor} ${theme.textMuted}`}>
                      <span>Data Limite p/ Desbloqueio:</span>
                      <span className="font-mono font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                        {room.maintenanceUntil || "20/08/2026 18:00"}
                      </span>
                    </div>
                    {room.notes && (
                      <p className={`text-[10px] italic ${theme.textMuted}`}>
                        Motivo: {room.notes}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className={`p-3 rounded-xl border space-y-2 text-xs ${
                    theme.isDark ? "bg-slate-950/60 border-slate-800/80" : "bg-slate-100/90 border-slate-200"
                  }`}>
                    {room.guest ? (
                      <div className="flex items-center">
                        <span className={`font-bold truncate ${theme.textMain}`}>{room.guest}</span>
                      </div>
                    ) : (
                      <div className={`flex items-center justify-between ${theme.textMuted}`}>
                        <span>Sem hospedagem ativa</span>
                      </div>
                    )}

                    {room.dates && !room.dates.includes("Disponível") && !room.dates.toLowerCase().includes("checkout") && !room.dates.toLowerCase().includes("check-out") && !room.dates.toLowerCase().includes("bloqueado") && !room.dates.toLowerCase().includes("manutenção") && (
                      <div className={`flex items-center justify-between ${theme.textMuted}`}>
                        <span>Período / Status:</span>
                        <span className={`font-mono ${theme.isDark ? "text-slate-200" : "text-slate-800"}`}>
                          {/* Evita contradição com o selo "Em limpeza" no rodapé quando já existe governanta atuando */}
                          {housekeepingByRoomId[room.id] ? "Em limpeza" : room.dates}
                        </span>
                      </div>
                    )}

                    {isOccupied && (
                      <div className="flex items-center justify-between pt-1 border-t border-slate-700/40">
                        <span className="font-semibold text-amber-500">Consumo Acumulado:</span>
                        <span className="font-mono font-bold text-amber-500">
                          R$ {(room.totalConsumption || 0).toFixed(2).replace(".", ",")}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* 🔔 PAINEL DE DETALHE: PRÓXIMA RESERVA DO DIA */}
                {hasTodayReservation && firstTodayRes && (
                  <div className={`mt-1 rounded-xl border px-3 py-2 space-y-1 text-[10px] font-mono ${ 
                    isMaintenance || isOccupied
                      ? "bg-red-950/30 border-red-600/40"
                      : isCleaning && !isOccupied
                      ? "bg-orange-950/30 border-orange-500/40"
                      : "bg-emerald-950/20 border-emerald-600/30"
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className={`font-bold flex items-center gap-1 ${
                        isMaintenance || isOccupied ? "text-red-400" : isCleaning && !isOccupied ? "text-orange-400" : "text-emerald-400"
                      }`}>
                        <CalendarCheck className="w-3 h-3 shrink-0" />
                        Próximo Check-in
                      </span>
                      <span className={`font-bold px-1.5 py-0.5 rounded ${
                        isMaintenance || isOccupied
                          ? "bg-red-600/30 text-red-300"
                          : isCleaning && !isOccupied
                          ? "bg-orange-500/30 text-orange-300"
                          : "bg-emerald-600/20 text-emerald-300"
                      }`}>
                        Hoje às {firstTodayRes.checkInTime}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-white font-bold truncate uppercase">{firstTodayRes.guestName}</span>
                    </div>
                    {firstTodayRes.reservationNumber && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Reserva:</span>
                        <span className="text-slate-300">{firstTodayRes.reservationNumber}</span>
                      </div>
                    )}
                    {todayResForRoom.length > 1 && (
                      <div className="text-center text-amber-400 font-bold pt-0.5 border-t border-amber-500/20">
                        ⚠️ +{todayResForRoom.length - 1} reserva(s) adicional(is) para hoje!
                      </div>
                    )}
                  </div>
                )}

                {/* Card Action Bar */}
                <div className="pt-1 border-t border-slate-800/40 flex items-center justify-between gap-1.5">
                  {isOccupied ? (
                    <>
                      <button
                        onClick={() => { setActiveRoom(room); setShowConsumptionModal(true); }}
                        className={`flex-1 py-2 px-1 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-0.5 border shadow-sm whitespace-nowrap ${
                          theme.isDark
                            ? "bg-[#0284C7]/20 hover:bg-[#0284C7]/30 text-[#38BDF8] border-[#0284C7]/40"
                            : "bg-sky-100 hover:bg-sky-200 text-sky-800 border-sky-300"
                        }`}
                      >
                        + Consumo
                      </button>
                      <button
                        onClick={() => { setActiveRoom(room); setShowExtratoModal(true); }}
                        className={`flex-1 py-2 px-1 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-0.5 border shadow-sm whitespace-nowrap ${
                          theme.isDark
                            ? "bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-400 border-cyan-800/60"
                            : "bg-cyan-100 hover:bg-cyan-200 text-cyan-800 border-cyan-300"
                        }`}
                        title="Imprimir Extrato de Hospedagem (Detalhamento & Whats)"
                      >
                        <Printer className="w-3 h-3 text-[#00BCD4] shrink-0" /> Extrato
                      </button>
                      <button
                        onClick={() => { setActiveRoom(room); setShowResumoModal(true); }}
                        className={`flex-1 py-2 px-1 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-0.5 border shadow-sm whitespace-nowrap ${
                          theme.isDark
                            ? "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300"
                        }`}
                        title="Imprimir Resumo de Hospedagem"
                      >
                        <FileText className="w-3 h-3 text-amber-500 shrink-0" /> Resumo
                      </button>
                    </>
                  ) : isCleaning ? (
                    <button
                      onClick={() => { setActiveRoom(room); setShowStatusModal(true); }}
                      className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border shadow-sm ${
                        theme.isDark
                          ? "bg-amber-950/40 hover:bg-amber-900/50 text-amber-400 border-amber-800/60"
                          : "bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300"
                      }`}
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Alterar Situação
                    </button>
                  ) : isMaintenance ? (
                    <button
                      onClick={() => { setActiveRoom(room); setShowStatusModal(true); }}
                      className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border shadow-sm ${
                        theme.isDark
                          ? "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                          : "bg-slate-200 hover:bg-slate-300 text-slate-800 border-slate-300"
                      }`}
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Alterar Situação
                    </button>
                  ) : (
                    // Quarto livre: verificar se tem reserva para o dia
                    hasTodayReservation ? (
                      // BLOQUEIO: Tem reserva para hoje — não permite check-in avulso
                      <div className="w-full space-y-1.5">
                        <div className="w-full py-2 px-3 rounded-xl bg-red-950/40 border border-red-600/40 text-red-300 text-xs font-bold flex items-center justify-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-400" />
                          Check-in Avulso BLOQUEADO
                        </div>
                        <button
                          onClick={() => {
                            openSelecaoReservaModal(room);
                          }}
                          className="w-full py-2 px-3 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md"
                        >
                          <CalendarCheck className="w-3.5 h-3.5" /> Check-in pela Reserva
                        </button>
                      </div>
                    ) : (
                      // Quarto livre sem reserva: check-in avulso liberado
                      <button
                        onClick={() => { setActiveRoom(room); setTargetRoomNumber(room.number); setShowCheckinModal(true); }}
                        className="w-full py-2 px-3 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md"
                      >
                        <UserCheck className="w-3.5 h-3.5" /> Efetuar Check-in
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* CONTEXT MENU POPUP (BOTÃO DIREITO / TRÊS PONTOS NO QUARTO) */}
      {contextMenu.visible && contextMenu.room && (
        <div
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className={`fixed z-50 w-72 border rounded-2xl shadow-2xl overflow-hidden text-xs py-1.5 animate-in fade-in zoom-in-95 duration-100 ${
            theme.isDark ? "bg-[#0F172A] border-slate-700 text-slate-200" : "bg-white border-slate-300 text-slate-800 shadow-2xl"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Room Title Header in Menu */}
          <div className={`px-3.5 py-2.5 border-b flex items-center justify-between ${
            theme.isDark ? "bg-slate-900 border-slate-800" : "bg-slate-100 border-slate-200"
          }`}>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#0284C7] text-white font-mono font-bold flex items-center justify-center text-xs">
                {contextMenu.room.number}
              </span>
              <span className={`font-bold ${theme.isDark ? "text-white" : "text-slate-900"}`}>{contextMenu.room.category}</span>
            </div>
            <span className="text-[10px] opacity-60 font-mono">Painel Assinante</span>
          </div>

          <div className={`max-h-[380px] overflow-y-auto divide-y ${theme.isDark ? "divide-slate-800/80" : "divide-slate-200"}`}>
            {/* GROUP 1: RESERVA & CHECKIN */}
            <div className="py-1">
              {/* Efetuar Reserva - ALWAYS ENABLED */}
              <button
                onClick={() => {
                  if (contextMenu.room) {
                    setSelectedRoomForReserva(contextMenu.room.number);
                    setActiveRoom(contextMenu.room);
                  }
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  setShowLancarReservaModal(true);
                }}
                className={`w-full px-3.5 py-2 text-left font-medium hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors ${
                  theme.isDark ? "text-slate-200" : "text-slate-800"
                }`}
              >
                <CalendarPlus className="w-4 h-4 text-[#0284C7]" />
                Efetuar Reserva (Sempre Disponível)
              </button>

              <button
                onClick={() => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  if (contextMenu.room) {
                    openSelecaoReservaModal(contextMenu.room);
                  }
                }}
                className={`w-full px-3.5 py-2 text-left hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors ${
                  theme.isDark ? "text-slate-300" : "text-slate-700"
                }`}
              >
                <Calendar className="w-4 h-4 text-slate-400" />
                Alterar Reserva
              </button>

              {/* Efetuar Hospedagem - Bloqueado se quarto tiver reserva para hoje */}
              {(() => {
                const ctxRoom = contextMenu.room!;
                const ctxResForRoom = todayReservationsByRoom[ctxRoom.number] || [];
                const ctxHasTodayRes = ctxResForRoom.length > 0;
                const isCtxVacant = ctxRoom.status === "VACANT_CLEAN";

                if (isCtxVacant && ctxHasTodayRes) {
                  // Quarto livre com reserva: bloqueia check-in avulso e oferece via reserva
                  return (
                    <>
                      <button
                        disabled
                        className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 opacity-40 cursor-not-allowed text-red-400"
                        title="Este quarto possui reserva para hoje. Use 'Check-in pela Reserva'."
                      >
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                        Hospedagem Avulsa BLOQUEADA (reserva ativa)
                      </button>
                      <button
                        onClick={() => {
                          setContextMenu(prev => ({ ...prev, visible: false }));
                          if (ctxRoom) {
                            openSelecaoReservaModal(ctxRoom);
                          }
                        }}
                        className={`w-full px-3.5 py-2 text-left hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors font-bold ${
                          theme.isDark ? "text-sky-300" : "text-sky-700"
                        }`}
                      >
                        <CalendarCheck className="w-4 h-4 text-[#10B981]" />
                        Check-in pela Reserva
                      </button>
                    </>
                  );
                }

                return (
                  <button
                    disabled={ctxRoom.status !== "VACANT_CLEAN"}
                    onClick={() => {
                      setContextMenu(prev => ({ ...prev, visible: false }));
                      if (ctxRoom) {
                        setActiveRoom(ctxRoom);
                        setTargetRoomNumber(ctxRoom.number);
                        setShowCheckinModal(true);
                      }
                    }}
                    className={`w-full px-3.5 py-2 text-left hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors ${
                      theme.isDark ? "text-slate-200" : "text-slate-800"
                    } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
                  >
                    <UserCheck className="w-4 h-4 text-[#10B981]" />
                    Efetuar Hospedagem (Check-in)
                  </button>
                );
              })()}
            </div>

            {/* GROUP 2: HOSPEDAGEM OPERACIONAL */}
            <div className="py-1">
              <button
                disabled={contextMenu.room.status !== "OCCUPIED" && contextMenu.room.status !== "OCCUPIED_CLEANING"}
                onClick={() => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  if (contextMenu.room) {
                    setActiveRoom(contextMenu.room);
                    setShowAlterarPeriodoModal(true);
                  }
                }}
                className={`w-full px-3.5 py-2 text-left hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors ${
                  theme.isDark ? "text-slate-200" : "text-slate-800 font-medium"
                } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
              >
                <Clock className="w-4 h-4 text-[#F59E0B]" />
                Alterar Período Hospedagem
              </button>

              <button
                disabled={contextMenu.room.status !== "OCCUPIED" && contextMenu.room.status !== "OCCUPIED_CLEANING"}
                onClick={() => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  if (contextMenu.room) {
                    setActiveRoom(contextMenu.room);
                    setShowAlterarTarifaModal(true);
                  }
                }}
                className={`w-full px-3.5 py-2 text-left hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors ${
                  theme.isDark ? "text-slate-200" : "text-slate-800 font-medium"
                } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
              >
                <DollarSign className="w-4 h-4 text-[#10B981]" />
                Alterar Tarifa da Hospedagem
              </button>

              <button
                disabled={contextMenu.room.status !== "OCCUPIED" && contextMenu.room.status !== "OCCUPIED_CLEANING"}
                onClick={() => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  if (contextMenu.room) {
                    setActiveRoom(contextMenu.room);
                    setLancarPagamentoMode("payment");
                    setShowLancarPagamentoModal(true);
                  }
                }}
                className={`w-full px-3.5 py-2 text-left hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors ${
                  theme.isDark ? "text-slate-200" : "text-slate-800 font-medium"
                } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
              >
                <CreditCard className="w-4 h-4 text-[#0284C7]" />
                Lançar Pagamento na Hospedagem
              </button>

              <button
                disabled={contextMenu.room.status !== "OCCUPIED" && contextMenu.room.status !== "OCCUPIED_CLEANING"}
                onClick={() => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  if (contextMenu.room) {
                    setActiveRoom(contextMenu.room);
                    setShowTransferDebitoModal(true);
                  }
                }}
                className={`w-full px-3.5 py-2 text-left hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors ${
                  theme.isDark ? "text-slate-200" : "text-slate-800 font-medium"
                } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
              >
                <ArrowRightLeft className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                Transferência de Débitos
              </button>
            </div>

            {/* GROUP 3: IMPRESSÕES E CONSUMO */}
            <div className="py-1">
              <button
                disabled={contextMenu.room.status !== "OCCUPIED" && contextMenu.room.status !== "OCCUPIED_CLEANING"}
                onClick={() => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  if (contextMenu.room) {
                    setActiveRoom(contextMenu.room);
                    setShowExtratoModal(true);
                  }
                }}
                className={`w-full px-3.5 py-2 text-left hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors font-semibold ${
                  theme.isDark ? "text-cyan-300" : "text-cyan-800"
                } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
              >
                <Printer className="w-4 h-4 text-[#00BCD4]" />
                Imprimir Extrato de Hospedagem
              </button>

              <button
                disabled={contextMenu.room.status !== "OCCUPIED" && contextMenu.room.status !== "OCCUPIED_CLEANING"}
                onClick={() => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  if (contextMenu.room) {
                    setActiveRoom(contextMenu.room);
                    setShowHistoricoLimpezaModal(true);
                  }
                }}
                className={`w-full px-3.5 py-2 text-left hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors ${
                  theme.isDark ? "text-slate-200" : "text-slate-800 font-medium"
                } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
              >
                <Sparkles className="w-4 h-4 text-violet-500" />
                Histórico de Limpeza
              </button>

              <button
                disabled={contextMenu.room.status !== "OCCUPIED" && contextMenu.room.status !== "OCCUPIED_CLEANING"}
                onClick={() => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  if (contextMenu.room) {
                    setActiveRoom(contextMenu.room);
                    setShowResumoModal(true);
                  }
                }}
                className={`w-full px-3.5 py-2 text-left hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors ${
                  theme.isDark ? "text-slate-200" : "text-slate-800 font-medium"
                } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
              >
                <FileText className="w-4 h-4 text-[#F59E0B]" />
                Imprimir Resumo de Hospedagem
              </button>

              <button
                disabled={contextMenu.room.status !== "OCCUPIED" && contextMenu.room.status !== "OCCUPIED_CLEANING"}
                onClick={() => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  if (contextMenu.room) {
                    setActiveRoom(contextMenu.room);
                    setShowConsumptionModal(true);
                  }
                }}
                className={`w-full px-3.5 py-2 text-left hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors ${
                  theme.isDark ? "text-slate-200" : "text-slate-800 font-medium"
                } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
              >
                <Wine className="w-4 h-4 text-rose-500" />
                Lançar Consumo no Quarto
              </button>
            </div>

            {/* GROUP 4: WPP, OBSERVACAO & CHECKOUT */}
            <div className="py-1">
              <button
                disabled={contextMenu.room.status !== "OCCUPIED" && contextMenu.room.status !== "OCCUPIED_CLEANING"}
                onClick={() => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  if (contextMenu.room) {
                    setActiveRoom(contextMenu.room);
                    setLancarPagamentoMode("checkout");
                    setShowLancarPagamentoModal(true);
                  }
                }}
                className={`w-full px-3.5 py-2 text-left hover:bg-red-600 hover:text-white flex items-center gap-2.5 transition-colors font-semibold ${
                  theme.isDark ? "text-red-400" : "text-red-700"
                } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
              >
                <LogOutIcon className="w-4 h-4" />
                Encerrar Hospedagem (Checkout)
              </button>

              <button
                disabled={contextMenu.room.status !== "OCCUPIED" && contextMenu.room.status !== "OCCUPIED_CLEANING"}
                onClick={() => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  if (contextMenu.room) {
                    setActiveRoom(contextMenu.room);
                    setShowWppModal(true);
                  }
                }}
                className={`w-full px-3.5 py-2 text-left hover:bg-emerald-600 hover:text-white flex items-center gap-2.5 transition-colors font-medium ${
                  theme.isDark ? "text-emerald-400" : "text-emerald-700"
                } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
              >
                <MessageSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Enviar Mensagem (WhatsApp)
              </button>

              <button
                disabled={contextMenu.room.status !== "OCCUPIED" && contextMenu.room.status !== "OCCUPIED_CLEANING"}
                onClick={() => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  if (contextMenu.room) {
                    setActiveRoom(contextMenu.room);
                    setShowNotesModal(true);
                  }
                }}
                className={`w-full px-3.5 py-2 text-left hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors ${
                  theme.isDark ? "text-slate-200" : "text-slate-800"
                } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
              >
                <FileText className="w-4 h-4 text-slate-500" />
                Observação da Hospedagem
              </button>
            </div>

            {/* GROUP 5: GESTAO DE SITUACAO & AUTOMACAO */}
            <div className="py-1">
              <button
                disabled={contextMenu.room.status === "OCCUPIED" || contextMenu.room.status === "OCCUPIED_CLEANING"}
                onClick={() => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  if (contextMenu.room) {
                    setActiveRoom(contextMenu.room);
                    setShowStatusModal(true);
                  }
                }}
                className={`w-full px-3.5 py-2 text-left hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors font-medium ${
                  theme.isDark ? "text-slate-200" : "text-slate-800"
                } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
                title={
                  contextMenu.room.status === "OCCUPIED" || contextMenu.room.status === "OCCUPIED_CLEANING"
                    ? "Quartos ocupados só alteram situação via Transferência ou Checkout"
                    : ""
                }
              >
                <RefreshCw className="w-4 h-4 text-[#0284C7]" />
                Mudar Situação Quarto
              </button>

              <button
                disabled={contextMenu.room.status !== "OCCUPIED" && contextMenu.room.status !== "OCCUPIED_CLEANING"}
                onClick={() => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  if (contextMenu.room) {
                    setActiveRoom(contextMenu.room);
                    setShowAutomationModal(true);
                  }
                }}
                className={`w-full px-3.5 py-2 text-left hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors ${
                  theme.isDark ? "text-slate-200" : "text-slate-800"
                } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
              >
                <Cpu className="w-4 h-4 text-[#F59E0B]" />
                Automação do Quarto (IoT / Smart Room)
              </button>

              <button
                disabled={contextMenu.room.status !== "OCCUPIED" && contextMenu.room.status !== "OCCUPIED_CLEANING"}
                onClick={() => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  if (contextMenu.room) {
                    setActiveRoom(contextMenu.room);
                    setShowTransferModal(true);
                  }
                }}
                className={`w-full px-3.5 py-2 text-left hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors ${
                  theme.isDark ? "text-slate-200" : "text-slate-800"
                } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
              >
                <ArrowRightLeft className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                Transferência de Quarto
              </button>
            </div>
          </div>
        </div>
      )}


      {/* MODAL 0: EFETUAR CHECK-IN COM TARIFA E DADOS DA HOSPEDAGEM (PRINTS 1 & 2) */}

      {showCheckinModal && activeRoom && (
        <CheckinHospedagemModal
          isOpen={showCheckinModal}
          onClose={() => {
            setShowCheckinModal(false);
            setReservaParaCheckin(null);
          }}
          roomData={{
            number: activeRoom.number,
            description: "1 CAMA DE CASAL + 1 SOLTEIRO",
            location: "TÉRREO",
            category: activeRoom.category || "ESPECIAL",
            ratePerNight: reservaParaCheckin?.dailyRate || activeRoom.ratePerNight || 170,
          }}
          reservationData={reservaParaCheckin ? {
            id: reservaParaCheckin.id,
            precheckinSent: reservaParaCheckin.precheckinSent,
            fnrhCompleted: reservaParaCheckin.fnrhCompleted,
            reservationNumber: reservaParaCheckin.reservationNumber || reservaParaCheckin.id,
            guestName: reservaParaCheckin.guestName,
            cpf: reservaParaCheckin.cpf || reservaParaCheckin.guestCpf,
            phone: reservaParaCheckin.phone,
            email: reservaParaCheckin.email,
            birthDate: reservaParaCheckin.birthDate,
            gender: reservaParaCheckin.gender,
            motherName: reservaParaCheckin.motherName,
            fatherName: reservaParaCheckin.fatherName,
            identity: reservaParaCheckin.identity,
            fullAddress: reservaParaCheckin.fullAddress || reservaParaCheckin.address,
            checkInDate: reservaParaCheckin.checkInDate,
            checkOutDate: reservaParaCheckin.checkOutDate,
            adults: reservaParaCheckin.adults,
            children: reservaParaCheckin.children,
            totalAmount: reservaParaCheckin.totalAmount,
            depositPaid: reservaParaCheckin.depositPaid,
            tariffName: reservaParaCheckin.tariffName,
            dailyRate: reservaParaCheckin.dailyRate,
            notes: reservaParaCheckin.notes,
            observations: reservaParaCheckin.observations,
            payments: reservaParaCheckin.payments,
            roomNumber: reservaParaCheckin.roomNumber || activeRoom.number,
          } : undefined}
          onSuccess={async (checkinData) => {
            // Fonte única de verdade: um único POST atômico no backend cria a StayCheckin,
            // marca o quarto OCCUPIED e sincroniza a Reservation de origem para CHECKED_IN —
            // tudo dentro da mesma transação de banco (ver POST /api/stay/checkin). Se qualquer
            // etapa falhar, nada é persistido, e a UI só reflete o estado depois de confirmado.
            const targetResId = checkinData.reservationId || reservaParaCheckin?.id || todayReservationsByRoom[activeRoom.number]?.[0]?.id || null;

            let checkinSaved = false;
            try {
              const stayRes = await fetch("/api/stay/checkin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  tenantId: "tenant-hoteisnet-demo",
                  roomNumber: activeRoom.number,
                  guestName: checkinData.guestName,
                  documentType: checkinData.documentType,
                  documentNumber: checkinData.documentNumber,
                  phone: checkinData.phone,
                  birthDate: checkinData.birthDate,
                  gender: checkinData.gender,
                  motherName: checkinData.motherName,
                  fatherName: checkinData.fatherName,
                  fullAddress: checkinData.fullAddress,
                  email: checkinData.email,
                  checkInDate: brDateTimeToIso(checkinData.checkInDate),
                  checkOutDate: brDateTimeToIso(checkinData.checkOutDate),
                  dailyRate: checkinData.dailyRate,
                  reservationId: targetResId,
                  totalAmount: checkinData.totalBruto,
                  tariffId: checkinData.tariffId,
                  tariffName: checkinData.tariffName,
                  operatorId: checkinData.operatorId,
                  operatorName: checkinData.operatorName,
                  initialPayments: checkinData.initialPayments,
                  discount: checkinData.discount,
                  secondaryGuests: checkinData.secondaryGuests,
                  adults: checkinData.adults,
                  children: checkinData.children,
                }),
              });
              const stayData = await stayRes.json();
              checkinSaved = !!stayData.success;
              if (!stayData.success) {
                console.error("[Checkin] Falha ao registrar hospedagem:", stayData.error);
                toast.error(
                  `⚠️ Check-in do Quarto ${activeRoom.number} NÃO foi salvo no banco de dados: ${stayData.error || "erro desconhecido"}. Tente novamente.`,
                  "Falha ao Registrar Check-in"
                );
              }
            } catch (stayErr) {
              console.error("[Checkin] Erro ao registrar hospedagem no banco de dados:", stayErr);
              toast.error(
                `⚠️ Não foi possível registrar o check-in do Quarto ${activeRoom.number} no banco de dados. Tente novamente.`,
                "Falha ao Registrar Check-in"
              );
            }

            if (!checkinSaved) {
              setShowCheckinModal(false);
              setReservaParaCheckin(null);
              return;
            }

            // A UI só é atualizada de forma otimista DEPOIS de o backend confirmar sucesso.
            setRooms((prev) =>
              prev.map((r) =>
                r.id === activeRoom.id
                  ? {
                      ...r,
                      status: "OCCUPIED",
                      guest: checkinData.guestName,
                      dates: `Check-out: ${checkinData.checkOutDate.split(" ")[0]}`,
                      ratePerNight: checkinData.dailyRate,
                    }
                  : r
              )
            );

            // Dispara a animação de boas-vindas (casal entrando/se acomodando) no card recém-ocupado
            setCheckinCelebrationGuest(checkinData.guestName);
            setCheckinCelebrationRoomId(activeRoom.id);

            // Remover da lista de reservas pendentes de hoje (apaga a badge visual de overbooking "RESERVA HOJE")
            setTodayReservationsByRoom((prev) => {
              const copy = { ...prev };
              delete copy[activeRoom.number];
              return copy;
            });

            setShowCheckinModal(false);
            setReservaParaCheckin(null);

            toast.success(
              `✓ Check-in efetuado com sucesso no Quarto ${activeRoom.number}!\n\n` +
              `Hóspede: ${checkinData.guestName}\n` +
              `Documento (${checkinData.documentType}): ${checkinData.documentNumber}\n` +
              `Tarifa: ${checkinData.tariffName} (R$ ${checkinData.dailyRate.toFixed(2)}/dia)\n` +
              `Diárias: ${checkinData.nights} diária(s) | Saldo a Pagar: R$ ${checkinData.balance.toFixed(2).replace(".", ",")}`,
              `Hospedagem Efetivada — Quarto ${activeRoom.number}`,
              6000
            );
          }}
        />
      )}

      {/* MODAL 1: LANÇAR CONSUMO NO QUARTO */}
      {showConsumptionModal && activeRoom && activeStayDetail && (
        <LancarConsumoQuartoModal
          isOpen={showConsumptionModal}
          onClose={() => setShowConsumptionModal(false)}
          stayData={{
            stayCheckinId: activeStayDetail.id,
            roomNumber: activeRoom.number,
            guestName: activeStayDetail.guest.fullName,
            checkInDate: formatBrDateTime(activeStayDetail.checkInDate),
            checkOutDate: formatBrDateTime(activeStayDetail.actualCheckOut || activeStayDetail.expectedCheckOut),
            totalBruto: activeStayDetail.totalDaily,
            desconto: 0,
            totalAdiantamento: activeStayPayments.reduce((acc, p) => acc + p.amount, 0),
            initialItems: activeStayDetail.consumptions.map((c) => ({
              clientId: c.id,
              id: c.id,
              productId: c.productId,
              productName: c.productName,
              quantity: c.quantity,
              unitPrice: c.unitPrice,
              totalPrice: c.totalPrice,
              posLocationId: c.posLocationId,
              posLocationName: c.posLocationName,
              operatorName: c.operatorName,
            })),
          }}
          onSaveSuccess={(updatedTotalConsumption) => {
            setRooms((prev) => prev.map((r) => (r.id === activeRoom.id ? { ...r, totalConsumption: updatedTotalConsumption } : r)));
            // Zera activeStayDetail para forçar um novo fetch na próxima abertura do consumo — o modal
            // tira um snapshot único dos itens ao montar, então sem isso itens cancelados/adicionados
            // reapareceriam com os dados antigos ao reabrir a tela para o mesmo quarto.
            setActiveStayDetail(null);
          }}
        />
      )}

      {/* Enquanto a hospedagem real ainda não voltou da API, mostra um loading — nunca os dados de amostra do componente.
          Extrato/Resumo/WhatsApp também esperam isLoadingStayModal (não só realStayBilling) porque tiram um
          snapshot único dos dados na abertura: se activeStayDetail já estivesse carregado de uma tela anterior
          (ex.: Lançar Pagamento aberta por baixo) eles montariam de imediato com dados desatualizados (ex.: sem
          um pagamento que acabou de ser salvo), sem chance de atualizar depois. */}
      {((showExtratoModal || showResumoModal || showWppModal) && activeRoom && (!realStayBilling || isLoadingStayModal)) ||
      ((showLancarPagamentoModal || showAlterarTarifaModal) && activeRoom && !realStayBilling) ||
      (showConsumptionModal && activeRoom && !activeStayDetail) ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm">
          <div className={`px-6 py-4 rounded-xl border shadow-2xl text-sm font-semibold flex items-center gap-2 ${theme.isDark ? "bg-[#0F172A] border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"}`}>
            <RefreshCw className="w-4 h-4 animate-spin" /> Carregando dados da hospedagem...
          </div>
        </div>
      ) : null}

      {/* MODAL EXTRATO DE HOSPEDAGEM (TELA WINDEV & WHATSAPP) */}
      {showExtratoModal && activeRoom && realStayBilling && !isLoadingStayModal && (
        <ImprimirExtratoHospedagemModal
          isOpen={showExtratoModal}
          onClose={() => setShowExtratoModal(false)}
          roomData={{
            number: activeRoom.number,
            category: activeRoom.category,
            guestName: realStayBilling?.guestName || activeRoom.guest || "",
            cpf: realStayBilling?.cpf || "",
            phone: realStayBilling?.phone || "",
            cep: realStayBilling?.cep || "",
            neighborhood: realStayBilling?.neighborhood || "",
            city: realStayBilling?.city || "",
            uf: realStayBilling?.uf || "",
            address: realStayBilling?.address || "",
            checkInDate: realStayBilling?.checkInDate || "",
            prevCheckOutDate: realStayBilling?.prevCheckOutDate || "",
            actualCheckOutDate: realStayBilling?.actualCheckOutDate || "",
            extrasAmount: realStayBilling?.extraDays ?? 0,
            adiantamento: realStayBilling?.totalAdiantamento ?? 0,
            desconto: realStayBilling?.discount ?? 0,
            allGuests: realStayBilling?.allGuests,
            tariffList: realStayBilling?.tariffList,
            consumptionList: realStayBilling?.consumptionList,
          }}
        />
      )}

      {/* MODAL RESUMO DE HOSPEDAGEM (PDF IMPRESSÃO) */}
      {showResumoModal && activeRoom && realStayBilling && !isLoadingStayModal && (
        <ImprimirResumoHospedagemModal
          isOpen={showResumoModal}
          onClose={() => setShowResumoModal(false)}
          roomData={{
            number: activeRoom.number,
            category: activeRoom.category,
            guestName: realStayBilling?.guestName || activeRoom.guest || "",
            cpf: realStayBilling?.cpf || "",
            phone: realStayBilling?.phone || "",
            cep: realStayBilling?.cep || "",
            neighborhood: realStayBilling?.neighborhood || "",
            city: realStayBilling?.city || "",
            uf: realStayBilling?.uf || "",
            address: realStayBilling?.address || "",
            checkInDate: realStayBilling?.checkInDate || "",
            prevCheckOutDate: realStayBilling?.prevCheckOutDate || "",
            calculatedUntil:
              realStayBilling?.tariffList?.[realStayBilling.tariffList.length - 1]?.endDate ||
              realStayBilling?.actualCheckOutDate ||
              "",
            diariasCount: realStayBilling?.nights || 0,
            totalDiarias: realStayBilling?.totalDiarias || 0,
            totalConsumo: realStayBilling?.totalConsumo || 0,
            outrosDebitos: realStayBilling?.outrosDebitos || 0,
            totalDespesas: realStayBilling?.totalDespesas || 0,
            pagamentosAmount: realStayBilling?.totalPago ?? 0,
            totalAFaturar: realStayBilling?.totalFaturado ?? 0,
            descontos: realStayBilling?.discount ?? 0,
            saldoAPagar: Math.max(
              0,
              (realStayBilling?.totalDespesas || 0) - (realStayBilling?.totalAdiantamento ?? 0) - (realStayBilling?.discount ?? 0)
            ),
            consumptionItems: realStayBilling?.consumptionList?.map((c) => ({
              dateTime: c.date,
              description: c.description,
              unitPrice: c.unitPrice,
              quantity: c.quantity,
              totalPrice: c.totalPrice,
            })),
            paymentItems: activeStayPayments.map((p) => ({
              dateTime: p.date,
              amount: p.amount,
              paymentMethod: p.methodDescription,
            })),
          }}
        />
      )}

      {/* MODAL MENSAGENS WHATSAPP (RESUMO/CONSUMO/EXTRATO EM PDF + TEXTO AVULSO) */}
      {showWppModal && activeRoom && realStayBilling && activeStayDetail && !isLoadingStayModal && (
        <MensagensWhatsAppModal
          isOpen={showWppModal}
          onClose={() => setShowWppModal(false)}
          roomData={{
            stayId: activeStayDetail.id,
            number: activeRoom.number,
            category: activeRoom.category,
            guestName: realStayBilling?.guestName || activeRoom.guest || "",
            cpf: realStayBilling?.cpf || "",
            phone: realStayBilling?.phone || "",
            cep: realStayBilling?.cep || "",
            neighborhood: realStayBilling?.neighborhood || "",
            city: realStayBilling?.city || "",
            uf: realStayBilling?.uf || "",
            address: realStayBilling?.address || "",
            checkInDate: realStayBilling?.checkInDate || "",
            prevCheckOutDate: realStayBilling?.prevCheckOutDate || "",
            actualCheckOutDate: realStayBilling?.actualCheckOutDate || "",
            extrasAmount: realStayBilling?.extraDays ?? 0,
            adiantamento: realStayBilling?.totalAdiantamento ?? 0,
            desconto: realStayBilling?.discount ?? 0,
            outrosDebitos: realStayBilling?.outrosDebitos ?? 0,
            allGuests: realStayBilling?.allGuests,
            tariffList: realStayBilling?.tariffList,
            consumptionList: realStayBilling?.consumptionList,
          }}
        />
      )}

      {/* MODAL 3: AUTOMAÇÃO IOT / SMART ROOM */}
      {showAutomationModal && activeRoom && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${theme.isDark ? "bg-slate-950/80 backdrop-blur-sm" : "bg-slate-900/50 backdrop-blur-sm"}`}>
          <div className={`border rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl ${theme.isDark ? "bg-[#0F172A] border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"}`}>
            <div className={`flex items-center justify-between pb-3 border-b ${theme.isDark ? "border-slate-800" : "border-slate-200"}`}>
              <h3 className={`font-bold text-base flex items-center gap-2 ${theme.isDark ? "text-white" : "text-slate-900"}`}>
                <Cpu className="w-5 h-5 text-[#F59E0B]" /> Automação IoT • Quarto {activeRoom.number}
              </h3>
              <button onClick={() => setShowAutomationModal(false)} className="opacity-70 hover:opacity-100 transition-opacity">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className={`p-3 rounded-xl border flex items-center justify-between ${theme.isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
                <div>
                  <span className={`font-semibold block ${theme.isDark ? "text-white" : "text-slate-900"}`}>Relé de Energia Principal</span>
                  <span className="text-[10px] opacity-75">Cartão RFID / Economia de Energia</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-600 font-bold text-[10px]">LIGADO</span>
              </div>

              <div className={`p-3 rounded-xl border flex items-center justify-between ${theme.isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
                <div>
                  <span className={`font-semibold block ${theme.isDark ? "text-white" : "text-slate-900"}`}>Ar-Condicionado Inverter</span>
                  <span className="text-[10px] opacity-75">Termostato: 22°C (Modo Auto)</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-600 font-bold text-[10px]">ATIVO</span>
              </div>

              <div className={`p-3 rounded-xl border flex items-center justify-between ${theme.isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
                <div>
                  <span className={`font-semibold block ${theme.isDark ? "text-white" : "text-slate-900"}`}>Fechadura Bluetooth / QrCode</span>
                  <span className="text-[10px] opacity-75">Bateria: 92% • Firmware OK</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-600 font-bold text-[10px]">TRAVADO</span>
              </div>
            </div>

            <div className={`pt-3 border-t flex items-center justify-end ${theme.isDark ? "border-slate-800" : "border-slate-200"}`}>
              <button onClick={() => setShowAutomationModal(false)} className={`px-4 py-2 rounded-xl text-xs font-semibold ${theme.isDark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
                Fechar Painel IoT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: MUDAR SITUAÇÃO DO QUARTO */}
      {showStatusModal && activeRoom && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${theme.isDark ? "bg-slate-950/80 backdrop-blur-sm" : "bg-slate-900/50 backdrop-blur-sm"}`}>
          <div className={`border rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl ${theme.isDark ? "bg-[#0F172A] border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"}`}>
            <div className={`flex items-center justify-between pb-3 border-b ${theme.isDark ? "border-slate-800" : "border-slate-200"}`}>
              <h3 className={`font-bold text-base flex items-center gap-2 ${theme.isDark ? "text-white" : "text-slate-900"}`}>
                <RefreshCw className="w-5 h-5 text-[#0284C7]" /> Alterar Situação • Quarto {activeRoom.number}
              </h3>
              <button 
                onClick={() => {
                  setShowStatusModal(false);
                  setIsSettingMaintenance(false);
                }} 
                className="opacity-70 hover:opacity-100 transition-opacity"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <button
                onClick={async () => {
                  const room = activeRoom;
                  setShowStatusModal(false);
                  setIsSettingMaintenance(false);
                  try {
                    const res = await fetch("/api/reservations/rooms", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ roomNumber: room.number, status: "VACANT_CLEAN", notes: "Quarto Higienizado & Vistoriado" }),
                    });
                    const data = await res.json();
                    if (!data.success) {
                      toast.error(`⚠️ Não foi possível alterar o Quarto ${room.number} no banco de dados: ${data.error || "erro desconhecido"}.`, "Falha ao Alterar Situação");
                      return;
                    }
                  } catch (err) {
                    toast.error(`⚠️ Não foi possível alterar o Quarto ${room.number} no banco de dados.`, "Falha ao Alterar Situação");
                    return;
                  }
                  setRooms(prev => prev.map(r => r.id === room.id ? {
                    ...r,
                    status: "VACANT_CLEAN",
                    guest: null,
                    dates: "Disponível para Check-in",
                    maintenanceUntil: undefined,
                    notes: "Quarto Higienizado & Vistoriado"
                  } : r));
                  toast.success(`Quarto ${room.number} alterado para Livre / Higienizado.`);
                }}
                className={`w-full p-3 rounded-xl border text-left font-semibold flex items-center justify-between transition-colors ${
                  theme.isDark ? "bg-[#10B981]/15 hover:bg-[#10B981]/25 border-[#10B981]/30 text-white" : "bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-900"
                }`}
              >
                <span>🟢 Livre / Higienizado</span>
                <span className="text-[10px] text-[#10B981] font-bold">Pronto Recepção</span>
              </button>

              <button
                onClick={async () => {
                  const room = activeRoom;
                  setShowStatusModal(false);
                  setIsSettingMaintenance(false);
                  try {
                    const res = await fetch("/api/reservations/rooms", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ roomNumber: room.number, status: "VACANT_DIRTY", notes: "Pendente troca de enxoval & higienização" }),
                    });
                    const data = await res.json();
                    if (!data.success) {
                      toast.error(`⚠️ Não foi possível alterar o Quarto ${room.number} no banco de dados: ${data.error || "erro desconhecido"}.`, "Falha ao Alterar Situação");
                      return;
                    }
                  } catch (err) {
                    toast.error(`⚠️ Não foi possível alterar o Quarto ${room.number} no banco de dados.`, "Falha ao Alterar Situação");
                    return;
                  }
                  setRooms(prev => prev.map(r => r.id === room.id ? {
                    ...r,
                    status: "VACANT_DIRTY",
                    guest: null,
                    dates: "Checkout / Limpeza",
                    maintenanceUntil: undefined,
                    notes: "Pendente troca de enxoval & higienização"
                  } : r));
                  toast.success(`Quarto ${room.number} alterado para Pendente Limpeza (Sujo).`);
                }}
                className={`w-full p-3 rounded-xl border text-left font-semibold flex items-center justify-between transition-colors ${
                  theme.isDark ? "bg-[#EAB308]/15 hover:bg-[#EAB308]/25 border-[#EAB308]/30 text-white" : "bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900"
                }`}
              >
                <span>🟡 Pendente Limpeza (Sujo)</span>
                <span className="text-[10px] text-[#EAB308] font-bold">Governança</span>
              </button>

              <div className={`rounded-xl border p-3 space-y-3 ${
                theme.isDark ? "border-amber-500/30 bg-amber-500/10" : "border-amber-300 bg-amber-50"
              }`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-amber-600 flex items-center gap-1.5">
                    <Wrench className="w-4 h-4 text-amber-500" /> Em Manutenção / Bloqueado
                  </span>
                  <span className="text-[10px] text-amber-600 font-mono font-bold">OS Manutenção</span>
                </div>

                <div className="space-y-2 pt-1 border-t border-amber-500/20">
                  <div>
                    <label className={`block font-semibold mb-1 text-[11px] ${theme.isDark ? "text-slate-300" : "text-slate-700"}`}>
                      Data Limite para Desbloqueio:
                    </label>
                    <input
                      type="text"
                      value={maintenanceUntilInput}
                      onChange={(e) => setMaintenanceUntilInput(e.target.value)}
                      placeholder="Ex: 20/08/2026 18:00"
                      className={`w-full border rounded-lg p-2 font-mono text-xs outline-none ${
                        theme.isDark ? "bg-slate-900 border-slate-700 text-white focus:border-amber-400" : "bg-white border-slate-300 text-slate-900 focus:border-amber-500"
                      }`}
                    />
                  </div>

                  <div>
                    <label className={`block font-semibold mb-1 text-[11px] ${theme.isDark ? "text-slate-300" : "text-slate-700"}`}>
                      Motivo / Observação da OS:
                    </label>
                    <input
                      type="text"
                      value={maintenanceNotesInput}
                      onChange={(e) => setMaintenanceNotesInput(e.target.value)}
                      placeholder="Ex: Manutenção no Ar-Condicionado (OS #402)"
                      className={`w-full border rounded-lg p-2 text-xs outline-none ${
                        theme.isDark ? "bg-slate-900 border-slate-700 text-white focus:border-amber-400" : "bg-white border-slate-300 text-slate-900 focus:border-amber-500"
                      }`}
                    />
                  </div>

                  <button
                    onClick={async () => {
                      const room = activeRoom;
                      const maintenanceNotes = maintenanceNotesInput || "Em Manutenção";
                      setShowStatusModal(false);
                      setIsSettingMaintenance(false);
                      try {
                        const res = await fetch("/api/reservations/rooms", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ roomNumber: room.number, status: "MAINTENANCE", notes: maintenanceNotes }),
                        });
                        const data = await res.json();
                        if (!data.success) {
                          toast.error(`⚠️ Não foi possível alterar o Quarto ${room.number} no banco de dados: ${data.error || "erro desconhecido"}.`, "Falha ao Alterar Situação");
                          return;
                        }
                      } catch (err) {
                        toast.error(`⚠️ Não foi possível alterar o Quarto ${room.number} no banco de dados.`, "Falha ao Alterar Situação");
                        return;
                      }
                      setRooms(prev => prev.map(r => r.id === room.id ? {
                        ...r,
                        status: "MAINTENANCE",
                        guest: null,
                        dates: "Bloqueado para Manutenção",
                        maintenanceUntil: maintenanceUntilInput || "20/08/2026 18:00",
                        notes: maintenanceNotes
                      } : r));
                      toast.warning(`Quarto ${room.number} colocado em Manutenção / Bloqueado.`);
                    }}
                    className="w-full py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    Confirmar Bloqueio / Manutenção
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LOADING OVERLAY: dados da hospedagem ainda não chegaram do servidor */}
      <LoadingOverlay
        show={!!(showAlterarPeriodoModal && activeRoom && (!activeStayDetail || !realStayBilling))}
        message="Buscando dados da hospedagem..."
        submessage="Estamos carregando as informações mais recentes do quarto."
      />

      {/* ALTERAR PERÍODO HOSPEDAGEM MODAL */}
      {showAlterarPeriodoModal && activeRoom && activeStayDetail && realStayBilling && (
        <AlterarPeriodoModal
          isOpen={showAlterarPeriodoModal}
          onClose={() => setShowAlterarPeriodoModal(false)}
          stayData={{
            idHospedagem: activeStayDetail.id,
            roomNumber: activeRoom.number,
            roomCategory: activeRoom.category,
            guestName: realStayBilling.guestName || activeRoom.guest || "HÓSPEDE REGISTRADO",
            cpf: realStayBilling.cpf || "",
            checkInDate: realStayBilling.checkInDate,
            checkOutDate: realStayBilling.prevCheckOutDate,
            ratePerNight: realStayBilling.tariffList[realStayBilling.tariffList.length - 1]?.dailyRate ?? activeRoom.ratePerNight ?? 170,
            tariffName: realStayBilling.tariffList[realStayBilling.tariffList.length - 1]?.description,
            roomDescription: activeRoom.category,
            totalConsumption: realStayBilling.totalConsumo,
            payments: activeStayPayments.map((p) => ({
              id: p.id,
              date: p.date,
              amount: p.amount,
              paymentMethod: p.methodDescription,
            })),
            lastChargeReferenceDateISO: realStayBilling.tariffList[realStayBilling.tariffList.length - 1]?.referenceDateISO,
            existingReservations: activeRoomReservations,
          }}
          onSave={async (updatedData) => {
            try {
              const res = await fetch("/api/stay/period", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  stayCheckinId: activeStayDetail.id,
                  expectedCheckOut: updatedData.checkOutDateISO,
                  ratePerNight: updatedData.ratePerNight,
                  tariffName: updatedData.tariffName,
                }),
              });
              const data = await res.json();
              if (!data.success) {
                toast.error(data.error || "Não foi possível alterar o período da hospedagem.");
                return;
              }

              setRooms((prev) =>
                prev.map((r) =>
                  r.id === activeRoom.id
                    ? {
                        ...r,
                        dates: `Check-out: ${new Date(data.expectedCheckOut).toLocaleDateString("pt-BR")}`,
                        expectedCheckOutDate: String(data.expectedCheckOut).split("T")[0],
                        ratePerNight: updatedData.ratePerNight,
                      }
                    : r
                )
              );
              setActiveStayDetail((prev) =>
                prev
                  ? {
                      ...prev,
                      expectedCheckOut: data.expectedCheckOut,
                      totalDaily: data.totalDaily,
                      dailyCharges: data.dailyCharges,
                    }
                  : prev
              );

              toast.success(`Período de hospedagem atualizado com sucesso!\n\nNova previsão de saída: ${updatedData.checkOutDate}\nTarifa: ${updatedData.tariffName} (R$ ${updatedData.ratePerNight.toFixed(2)}/dia)`);
            } catch (err) {
              console.error("[AlterarPeriodoModal] Erro ao salvar:", err);
              toast.error("Erro de conexão ao alterar o período da hospedagem.");
            }
          }}
        />
      )}

      {/* ALTERAR TARIFA DA HOSPEDAGEM MODAL (PRINTS 1 & 2) */}
      {showAlterarTarifaModal && activeRoom && activeStayDetail && realStayBilling && (
        <AlterarTarifaHospedagemModal
          isOpen={showAlterarTarifaModal}
          onClose={() => setShowAlterarTarifaModal(false)}
          stayData={{
            idHospedagem: activeStayDetail.id,
            cpf: realStayBilling.cpf || "",
            guestName: realStayBilling.guestName || activeRoom.guest || "",
            roomNumber: activeRoom.number,
            roomDescription: activeRoom.category,
            checkInDate: realStayBilling.checkInDate,
            checkOutDate: realStayBilling.prevCheckOutDate,
            adults: 1,
            children: 0,
            nights: realStayBilling.nights,
            totalBruto: realStayBilling.totalDiarias,
            totalAdvance: activeStayPayments.reduce((acc, p) => acc + p.amount, 0),
            discount: 0,
            totalConsumption: realStayBilling.totalConsumo,
            dailyRates: realStayBilling.tariffList.map((t, idx) => ({
              id: `d${idx + 1}`,
              tariffName: t.description,
              startDate: t.startDate,
              endDate: t.endDate,
              rateValue: t.dailyRate,
              referenceDate: t.referenceDateISO,
              selected: false,
            })),
          }}
          onSave={(updatedData) => {
            const lastRate = updatedData.dailyRates[updatedData.dailyRates.length - 1]?.rateValue;
            setRooms((prev) =>
              prev.map((r) =>
                r.id === activeRoom.id
                  ? { ...r, ratePerNight: lastRate ?? r.ratePerNight }
                  : r
              )
            );
            setActiveStayDetail((prev) =>
              prev
                ? {
                    ...prev,
                    totalDaily: updatedData.totalBruto,
                    dailyCharges: updatedData.dailyRates.map((d) => ({
                      referenceDate: d.referenceDate || "",
                      amount: d.rateValue,
                      description: d.tariffName,
                    })),
                  }
                : prev
            );
          }}
        />
      )}

      {/* CADASTRO DE TARIFAS MODAL (PRINT 3) */}
      {showCadastroTarifasModal && (
        <CadastroTarifasModal
          isOpen={showCadastroTarifasModal}
          onClose={() => setShowCadastroTarifasModal(false)}
        />
      )}

      {/* LANÇAR PAGAMENTO NA HOSPEDAGEM MODAL (WINDEV WIN_PAGAMENTOHOSPEDAGEM) */}
      {showLancarPagamentoModal && activeRoom && activeStayDetail && realStayBilling && (
        <LancarPagamentoHospedagemModal
          isOpen={showLancarPagamentoModal}
          onClose={() => setShowLancarPagamentoModal(false)}
          mode={lancarPagamentoMode}
          stayData={{
            idHospedagem: activeStayDetail.id,
            roomNumber: activeRoom.number,
            primaryGuestId: activeStayDetail.guest.id,
            primaryGuestName: realStayBilling.guestName || activeRoom.guest || "",
            checkInDate: realStayBilling.checkInDate,
            expectedCheckOutDate: realStayBilling.prevCheckOutDate,
            actualCheckOutDate: realStayBilling.actualCheckOutDate,
            dailyCount: realStayBilling.nights,
            extrasCount: realStayBilling.extraDays,
            totalDiarias: realStayBilling.totalDiarias,
            totalConsumo: realStayBilling.totalConsumo,
            consumptionsDetail: activeStayDetail.consumptions.map((c) => ({
              dateTime: formatBrDateTime(c.createdAt),
              productName: c.productName,
              quantity: c.quantity,
              unitPrice: c.unitPrice,
              totalPrice: c.totalPrice,
            })),
            outrosDebitos: realStayBilling.outrosDebitos,
            outrosDebitosDetail: realStayBilling.outrosDebitosDetail,
            desconto: realStayBilling.discount,
            guestsList: [
              { id: "G-1", name: realStayBilling.guestName || activeRoom.guest || "" }
            ],
            initialPayments: activeStayPayments,
          }}
          onOpenConsumo={() => setShowConsumptionModal(true)}
          onOpenExtrato={() => setShowExtratoModal(true)}
          onOpenResumo={() => setShowResumoModal(true)}
          onCheckoutConfirmed={async () => {
            const room = activeRoom;
            const stayId = activeStayDetail?.id;

            if (!stayId) {
              toast.error(
                `⚠️ Não foi possível localizar a hospedagem ativa do Quarto ${room.number}. Checkout NÃO realizado.`,
                "Falha ao Encerrar Hospedagem"
              );
              return false;
            }

            // PATCH /api/stay/checkin é a ÚNICA fonte de verdade para encerrar uma hospedagem:
            // dentro de uma transação, fecha a StayCheckin, libera o quarto (VACANT_DIRTY) e
            // sincroniza a Reservation para CHECKED_OUT — nada mais precisa (nem deve) tocar
            // nesses três registros em paralelo.
            try {
              const res = await fetch("/api/stay/checkin", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ stayCheckinId: stayId }),
              });
              const data = await res.json();
              if (!data.success) {
                console.error("[Checkout] Falha ao encerrar hospedagem:", data.error);
                toast.error(
                  `⚠️ Checkout do Quarto ${room.number} NÃO foi salvo no banco de dados: ${data.error || "erro desconhecido"}. Tente novamente.`,
                  "Falha ao Encerrar Hospedagem"
                );
                return false;
              }
            } catch (err) {
              console.error("[Checkout] Erro ao encerrar hospedagem no banco de dados:", err);
              toast.error(
                `⚠️ Não foi possível registrar o checkout do Quarto ${room.number} no banco de dados. Tente novamente.`,
                "Falha ao Encerrar Hospedagem"
              );
              return false;
            }

            setRooms(prev => prev.map(r => r.id === room.id ? {
              ...r,
              status: "VACANT_DIRTY",
              guest: null,
              dates: "Checkout / Limpeza",
              totalConsumption: 0,
              maintenanceUntil: undefined,
              notes: "Pendente troca de enxoval & higienização",
            } : r));

            // Dispara a animação de despedida (casal deixando o quarto) no card recém-desocupado
            setCheckoutFarewellRoomId(room.id);

            toast.success(`Check-out do Quarto ${room.number} efetuado com sucesso! Quarto encaminhado para Governança (Limpeza).`, "Check-out Concluído");
            return true;
          }}
        />
      )}

      {/* HISTÓRICO DE LIMPEZA DURANTE A HOSPEDAGEM ATUAL */}
      {activeRoom && (
        <HistoricoLimpezaModal
          isOpen={showHistoricoLimpezaModal}
          onClose={() => setShowHistoricoLimpezaModal(false)}
          roomId={activeRoom.id}
          roomNumber={activeRoom.number}
        />
      )}

      {/* TRANSFERÊNCIA DE DÉBITOS ENTRE QUARTOS (WINDEV WIN_TRANSFERENCIADEBITO) */}
      {showTransferDebitoModal && activeRoom && activeStayDetail && (
        <TransferenciaDebitoModal
          isOpen={showTransferDebitoModal}
          onClose={() => setShowTransferDebitoModal(false)}
          tenantId="tenant-hoteisnet-demo"
          sourceStay={{
            stayCheckinId: activeStayDetail.id,
            roomNumber: activeRoom.number,
            guestName: activeStayDetail.guest.fullName,
            checkInDate: formatBrDateTime(activeStayDetail.checkInDate),
            expectedCheckOutDate: formatBrDateTime(activeStayDetail.expectedCheckOut),
            actualCheckOutDate: activeStayDetail.actualCheckOut ? formatBrDateTime(activeStayDetail.actualCheckOut) : undefined,
            dailyCount: activeStayDetail.dailiesCount,
            extrasCount: activeStayDetail.extraDailiesCount,
            totalDiarias: activeStayDetail.totalDaily,
            totalConsumo: activeStayDetail.totalConsumption,
            desconto: activeStayDetail.discount,
            totalAdiantamento: activeStayDetail.totalAdvance,
            outrosDebitos: activeStayDetail.otherDebits,
          }}
          destinationRoomOptions={transferDestinationOptions}
          onTransferSuccess={() => {
            syncRoomsFromDatabase();
            setActiveStayDetail(null);
            setActiveStayPayments([]);
            lastFetchedRoomNumberRef.current = null;
          }}
        />
      )}

      {/* LANÇAR NOVA RESERVA COM QUARTO PRÉ-PREENCHIDO */}
      {showLancarReservaModal && (
        <LancarReservaModal
          isOpen={showLancarReservaModal}
          onClose={() => {
            setShowLancarReservaModal(false);
            setReservaParaEditar(null);
          }}
          initialRoomNumber={selectedRoomForReserva}
          tenantId="TNT-01"
          editReservationData={reservaParaEditar}
          onSuccess={() => {
            setShowLancarReservaModal(false);
            setReservaParaEditar(null);
          }}
        />
      )}

      {showSelecaoReservaModal && (
        <SelecaoReservaQuartoModal
          isOpen={showSelecaoReservaModal}
          onClose={() => setShowSelecaoReservaModal(false)}
          roomNumber={selectedRoomForReserva}
          roomCategory={activeRoom?.category || "Acomodação"}
          reservations={selecaoReservaList}
          onSelectAlterarPeriodo={(res) => {
            setShowSelecaoReservaModal(false);
            setShowAlterarPeriodoModal(true);
          }}
          onSelectAlterarTarifa={(res) => {
            setShowSelecaoReservaModal(false);
            setShowAlterarTarifaModal(true);
          }}
          onSelectLancarPagamento={(res) => {
            setShowSelecaoReservaModal(false);
            setShowLancarPagamentoModal(true);
          }}
          onEfetuarCheckin={(res) => {
            // Abre modal de check-in pré-preenchido com os dados da reserva
            setReservaParaCheckin(res);
            setShowSelecaoReservaModal(false);
            setShowCheckinModal(true);
          }}
          onLancarNovaReservaQuarto={(roomNum) => {
            setSelectedRoomForReserva(roomNum);
            setShowLancarReservaModal(true);
          }}
          onSelectAlterarReserva={(res) => {
            setReservaParaEditar(res);
            setSelectedRoomForReserva(res.roomNumber || selectedRoomForReserva);
            setShowLancarReservaModal(true);
          }}
          loading={selecaoReservaLoading}
        />
      )}
    </div>
  );
}

