"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { X, Trash2, ScanLine, Printer, MessageSquare, Store, Loader2 } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { useOperator } from "@/context/OperatorContext";
import { useConfirm } from "@/context/ConfirmContext";

export interface ConsumoRow {
  clientId: string;
  id?: string; // presente = já persistido no banco (linha "azul")
  productId?: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  posLocationId?: string | null;
  posLocationName?: string | null;
  operatorName?: string | null;
}

interface PosLocationOption {
  id: string;
  name: string;
}

interface ProductSuggestion {
  id: string;
  name: string;
  salePrice: number | string;
  barcode?: string | null;
  category?: string | null;
}

export interface LancarConsumoQuartoModalProps {
  isOpen: boolean;
  onClose: () => void;
  stayData: {
    stayCheckinId: string;
    roomNumber: string;
    guestName: string;
    checkInDate: string;
    checkOutDate: string;
    totalBruto: number;
    desconto?: number;
    totalAdiantamento?: number;
    initialItems?: ConsumoRow[];
  };
  onSaveSuccess?: (updatedTotalConsumption: number) => void;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

let clientIdSeq = 0;
const nextClientId = () => `local-${Date.now()}-${clientIdSeq++}`;

export default function LancarConsumoQuartoModal({
  isOpen,
  onClose,
  stayData,
  onSaveSuccess,
}: LancarConsumoQuartoModalProps) {
  const { theme } = useTheme();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const { operatorId, operatorName } = useOperator();

  const [items, setItems] = useState<ConsumoRow[]>([]);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [posLocations, setPosLocations] = useState<PosLocationOption[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const [descricao, setDescricao] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [quantidade, setQuantidade] = useState(1);
  const [valorUnit, setValorUnit] = useState(0);
  const [observacao, setObservacao] = useState("");

  const [pendingProduct, setPendingProduct] = useState<{ id: string; name: string } | null>(null);
  const [showPdvPopup, setShowPdvPopup] = useState(false);
  const [pdvSelectedIndex, setPdvSelectedIndex] = useState(0);
  const pdvPopupRef = useRef<HTMLDivElement>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Filtro em tempo real por nome/código enquanto o operador digita no campo Cod/Cod.Barras.
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchSeqRef = useRef(0);

  const codeInputRef = useRef<HTMLInputElement>(null);
  const codeFieldWrapperRef = useRef<HTMLDivElement>(null);
  const observacaoRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setItems((stayData.initialItems || []).map((i) => ({ ...i })));
    setPendingDeleteIds([]);
    setSelectedClientId(null);
    setDescricao("");
    setCodeInput("");
    setQuantidade(1);
    setValorUnit(0);
    setObservacao("");
    setPendingProduct(null);
    setShowPdvPopup(false);
    setSuggestions([]);
    setShowSuggestions(false);

    fetch("/api/cadastros/pdv")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setPosLocations((data.posLocations || []).filter((x: any) => x.active !== false));
      })
      .catch(() => toast.error("Não foi possível carregar os Pontos de Venda (PDV)."));

    setTimeout(() => codeInputRef.current?.focus(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, stayData.stayCheckinId]);

  // Filtra produtos por nome/código conforme o operador digita (debounce de 250ms), em vez de
  // exigir código exato + Enter.
  useEffect(() => {
    const query = codeInput.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      setIsSearching(false);
      return;
    }

    const seq = ++searchSeqRef.current;
    setIsSearching(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stock/lookup?code=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (seq !== searchSeqRef.current) return; // resposta desatualizada (usuário já digitou mais)
        setSuggestions(data.success ? data.products || [] : []);
        setShowSuggestions(true);
      } catch {
        if (seq === searchSeqRef.current) setSuggestions([]);
      } finally {
        if (seq === searchSeqRef.current) setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(handle);
  }, [codeInput]);

  // Fecha o dropdown de sugestões ao clicar fora do campo de código.
  useEffect(() => {
    if (!showSuggestions) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (codeFieldWrapperRef.current && !codeFieldWrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSuggestions]);

  // Leva o foco para o popup de PDV assim que ele abre, para que as setas/Enter funcionem
  // imediatamente sem precisar clicar com o mouse.
  useEffect(() => {
    if (showPdvPopup) {
      setTimeout(() => pdvPopupRef.current?.focus(), 0);
    }
  }, [showPdvPopup]);

  const handlePdvPopupKeyDown = (e: React.KeyboardEvent) => {
    if (posLocations.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      setPdvSelectedIndex((prev) => (prev + 1) % posLocations.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      setPdvSelectedIndex((prev) => (prev - 1 + posLocations.length) % posLocations.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      handleChoosePdv(posLocations[pdvSelectedIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setShowPdvPopup(false);
    }
  };

  const visibleItems = useMemo(() => items.filter((i) => !i.id || !pendingDeleteIds.includes(i.id)), [items, pendingDeleteIds]);
  const totalConsumo = useMemo(() => visibleItems.reduce((acc, i) => acc + i.totalPrice, 0), [visibleItems]);
  const desconto = stayData.desconto ?? 0;
  const totalAdiantamento = stayData.totalAdiantamento ?? 0;
  const saldoAPagar = stayData.totalBruto - desconto - totalAdiantamento + totalConsumo;

  const selectSuggestion = useCallback((product: ProductSuggestion) => {
    setPendingProduct({ id: product.id, name: product.name });
    setDescricao(product.name);
    setValorUnit(parseFloat(String(product.salePrice)) || 0);
    setPdvSelectedIndex(0);
    setShowPdvPopup(true);
    setCodeInput("");
    setSuggestions([]);
    setShowSuggestions(false);
  }, []);

  // Acionado pelo Enter ou pelo botão de lupa: usa a primeira sugestão já filtrada (fluxo rápido de
  // leitor de código de barras), ou busca na hora se o debounce ainda não retornou nada.
  const handleLookupCode = useCallback(async () => {
    const code = codeInput.trim();
    if (!code) return;
    if (suggestions.length > 0) {
      selectSuggestion(suggestions[0]);
      return;
    }
    setIsLookingUp(true);
    try {
      const res = await fetch(`/api/stock/lookup?code=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Produto não encontrado.", "Código Inválido");
        return;
      }
      selectSuggestion(data.product);
    } catch {
      toast.error("Falha ao consultar o produto.", "Erro de Rede");
    } finally {
      setIsLookingUp(false);
    }
  }, [codeInput, suggestions, selectSuggestion, toast]);

  const handleChoosePdv = (pdv: PosLocationOption) => {
    if (!pendingProduct) return;
    const qty = quantidade > 0 ? quantidade : 1;
    const unit = valorUnit;
    const newRow: ConsumoRow = {
      clientId: nextClientId(),
      productId: pendingProduct.id,
      productName: pendingProduct.name,
      quantity: qty,
      unitPrice: unit,
      totalPrice: qty * unit,
      posLocationId: pdv.id,
      posLocationName: pdv.name,
    };
    setItems((prev) => [...prev, newRow]);
    setShowPdvPopup(false);
    setPendingProduct(null);
    setDescricao("");
    setCodeInput("");
    setValorUnit(0);
    setQuantidade(1);
    setTimeout(() => codeInputRef.current?.focus(), 50);
  };

  const handleDeleteRow = async (row: ConsumoRow) => {
    if (row.id) {
      const ok = await confirmDialog({
        title: "Excluir Lançamento de Consumo",
        message: `Deseja realmente excluir "${row.productName}" da conta? O estoque do PDV será devolvido e o valor será estornado do total de consumo ao salvar.`,
        confirmLabel: "Excluir",
        variant: "danger",
      });
      if (!ok) return;
      setPendingDeleteIds((prev) => [...prev, row.id!]);
    } else {
      setItems((prev) => prev.filter((i) => i.clientId !== row.clientId));
    }
    if (selectedClientId === row.clientId) setSelectedClientId(null);
  };

  const handleCancelarItem = () => {
    const row = visibleItems.find((i) => i.clientId === selectedClientId);
    if (!row) {
      toast.warning("Selecione um item na grade para cancelar.");
      return;
    }
    handleDeleteRow(row);
  };

  // Fecha a tela, mas avisa antes se houver itens lançados/excluídos ainda não salvos (F5) —
  // evita que o operador feche sem perceber e perca o que digitou.
  const handleRequestClose = async () => {
    const hasUnsaved = items.some((i) => !i.id) || pendingDeleteIds.length > 0;
    if (hasUnsaved) {
      const ok = await confirmDialog({
        title: "Sair sem salvar?",
        message:
          "Existem lançamentos de consumo ainda não salvos. Se sair agora, eles serão perdidos e o estoque/débito do quarto não será alterado. Deseja realmente sair sem salvar?",
        confirmLabel: "Sair sem Salvar",
        cancelLabel: "Continuar Editando",
        variant: "danger",
      });
      if (!ok) return;
    }
    onClose();
  };

  const handleSalvarLancamentos = async () => {
    if (isSaving) return;
    const newRows = items.filter((i) => !i.id);
    if (newRows.length === 0 && pendingDeleteIds.length === 0) {
      toast.info("Nenhuma alteração feita no consumo do quarto.", "Nada a Salvar");
      return;
    }

    setIsSaving(true);
    let runningTotal: number | null = null;

    try {
      for (const consumptionId of pendingDeleteIds) {
        const res = await fetch("/api/stay/consumo", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ consumptionId }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "Falha ao excluir lançamento de consumo.");
        runningTotal = data.totalConsumption;
      }
      setItems((prev) => prev.filter((i) => !i.id || !pendingDeleteIds.includes(i.id)));
      setPendingDeleteIds([]);

      for (const row of newRows) {
        const res = await fetch("/api/stay/consumo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stayCheckinId: stayData.stayCheckinId,
            productId: row.productId,
            productName: row.productName,
            quantity: row.quantity,
            unitPrice: row.unitPrice,
            posLocationId: row.posLocationId,
            operatorId,
            operatorName,
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || `Falha ao salvar "${row.productName}".`);
        runningTotal = data.totalConsumption;
        setItems((prev) =>
          prev.map((i) =>
            i.clientId === row.clientId
              ? { ...i, id: data.item.id, operatorName: data.item.operatorName, posLocationName: data.item.posLocationName }
              : i
          )
        );
      }

      toast.success("Lançamentos de consumo salvos com sucesso!", "Consumo Salvo");
      if (runningTotal !== null) onSaveSuccess?.(runningTotal);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Não foi possível salvar os lançamentos.", "Erro ao Salvar");
    } finally {
      setIsSaving(false);
    }
  };

  const handleImprimirConsumo = () => {
    if (visibleItems.length === 0) {
      toast.warning("Nenhum item de consumo para imprimir.");
      return;
    }
    const rowsHtml = visibleItems
      .map(
        (i, idx) => `<tr>
          <td>${idx + 1}</td>
          <td>${i.productName}</td>
          <td>${i.posLocationName || "-"}</td>
          <td style="text-align:right">${i.quantity.toFixed(4)}</td>
          <td style="text-align:right">${fmt(i.unitPrice)}</td>
          <td style="text-align:right">${fmt(i.totalPrice)}</td>
        </tr>`
      )
      .join("");

    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Consumo Quarto ${stayData.roomNumber}</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:12px;padding:16px;color:#111}
        h2{margin:0 0 4px}
        table{width:100%;border-collapse:collapse;margin-top:12px}
        th,td{border:1px solid #999;padding:4px 6px}
        th{background:#eee;text-align:left}
        .total{margin-top:10px;font-weight:bold;text-align:right}
      </style></head>
      <body>
        <h2>Consumo do Quarto ${stayData.roomNumber}</h2>
        <div>Hóspede: ${stayData.guestName}</div>
        <table><thead><tr><th>Item</th><th>Descrição</th><th>PDV</th><th>Quant.</th><th>Valor Unit.</th><th>Valor Total</th></tr></thead>
        <tbody>${rowsHtml}</tbody></table>
        <div class="total">Total de Consumo: ${fmt(totalConsumo)}</div>
      </body></html>`;

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    iframe.srcdoc = html;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      }, 250);
    };
    setTimeout(() => {
      if (iframe.parentNode) document.body.removeChild(iframe);
    }, 60000);
  };

  // Escuta no document (captura), não numa div interna: depois de confirmar um diálogo (ex.: excluir
  // item), o botão clicado some do DOM e o foco do navegador volta para o <body>, que não é descendente
  // da div do modal — um onKeyDown preso à div nunca recebe o evento nesse caso, e o F5 físico acaba
  // sendo tratado pelo navegador como "recarregar página" no meio de um salvamento.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        handleCancelarItem();
      } else if (e.key === "F5") {
        e.preventDefault();
        handleSalvarLancamentos();
      } else if (e.key === "F6") {
        e.preventDefault();
        handleImprimirConsumo();
      } else if (e.key === "F7") {
        e.preventDefault();
        observacaoRef.current?.focus();
      } else if (e.key === "Escape" && !showPdvPopup) {
        handleRequestClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, showPdvPopup, selectedClientId, items, pendingDeleteIds, isSaving]);

  if (!isOpen) return null;

  const inputClass = `w-full font-mono font-bold p-1.5 rounded border text-right outline-none ${
    theme.isDark ? "bg-slate-800 border-slate-700 text-yellow-300" : "bg-yellow-100 border-yellow-300 text-slate-900"
  }`;

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-sm overflow-y-auto"
      tabIndex={-1}
    >
      <div
        className={`w-full max-w-6xl rounded-xl border shadow-2xl overflow-hidden flex flex-col my-auto ${
          theme.isDark ? "bg-[#0F172A] border-slate-800 text-white" : "bg-[#F4F6F9] border-slate-300 text-slate-900"
        }`}
      >
        {/* Barra de Título */}
        <div className="bg-gradient-to-r from-[#184176] via-[#1E5296] to-[#0284C7] px-4 py-2.5 flex items-center justify-between text-white shadow-md select-none">
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-sky-200" />
            <h2 className="font-bold text-sm tracking-wide">
              Lançamento de consumo quarto: {stayData.roomNumber} - Hospede: {stayData.guestName}
            </h2>
          </div>
          <button onClick={handleRequestClose} className="p-1 rounded-lg hover:bg-white/20 transition-colors text-white" title="Fechar (Esc)">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-xs overflow-y-auto max-h-[85vh]">
          {/* Cabeçalho: Quarto, Hóspede, Datas, Totais */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div
              className={`md:col-span-8 p-3 rounded-lg border flex flex-wrap items-end gap-4 ${
                theme.isDark ? "bg-slate-900/90 border-slate-800" : "bg-white border-slate-200"
              }`}
            >
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Quartos</label>
                <span className="font-mono font-extrabold text-sm px-2.5 py-1 rounded bg-[#0284C7] text-white shadow-sm block">
                  {stayData.roomNumber}
                </span>
              </div>
              <div className="min-w-[220px] flex-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Nome do Hospede Principal</label>
                <input
                  type="text"
                  readOnly
                  value={stayData.guestName}
                  className={`w-full font-bold px-2 py-1 rounded border text-xs outline-none ${
                    theme.isDark ? "bg-slate-800 border-slate-700 text-yellow-400" : "bg-yellow-100 border-yellow-300 text-slate-900"
                  }`}
                />
              </div>
              <div>
                <span className="block text-[10px] text-slate-500 font-semibold">Dt.Chegada</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{stayData.checkInDate}</span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-500 font-semibold">Dt.Saida</span>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{stayData.checkOutDate}</span>
              </div>
            </div>

            <div className={`md:col-span-4 p-3 rounded-lg border space-y-2 ${theme.isDark ? "bg-slate-900/90 border-slate-800" : "bg-white border-slate-200"}`}>
              <h3 className="font-bold text-[11px] text-slate-500 uppercase">Totais (R$)</h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500">Valor total bruto</label>
                  <input readOnly value={fmt(stayData.totalBruto)} className={inputClass} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500">Desconto</label>
                  <input readOnly value={fmt(desconto)} className={inputClass} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500">Total Adiant.</label>
                  <input readOnly value={fmt(totalAdiantamento)} className={inputClass} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500">Total Consumo</label>
                  <input readOnly value={fmt(totalConsumo)} className={inputClass} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-extrabold text-blue-600 dark:text-blue-400 uppercase">Saldo a pagar (R$)</label>
                <div className="bg-yellow-300 dark:bg-yellow-400/90 text-red-600 font-extrabold text-xl p-2 rounded-lg text-right shadow-inner font-mono border-2 border-yellow-400">
                  {fmt(saldoAPagar)}
                </div>
              </div>
            </div>
          </div>

          {/* Barra de descrição */}
          <div className={`px-3 py-2 rounded font-bold text-sm ${theme.isDark ? "bg-yellow-400/90 text-slate-900" : "bg-yellow-300 text-slate-900"}`}>
            {descricao || " "}
          </div>

          {/* Grade + painel lateral */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className={`md:col-span-9 border rounded-lg overflow-hidden ${theme.isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"}`}>
              <div className="bg-[#00BCD4] text-white px-3 py-1.5 font-bold text-xs">Consumo detalhado</div>
              <div className="overflow-y-auto max-h-72">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead className="sticky top-0">
                    <tr className={theme.isDark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-600"}>
                      <th className="p-1.5">Item</th>
                      <th className="p-1.5">Descrição</th>
                      <th className="p-1.5">PDV</th>
                      <th className="p-1.5 text-right">Quant.</th>
                      <th className="p-1.5 text-right">Valor Unit</th>
                      <th className="p-1.5 text-right">Valor Total</th>
                      <th className="p-1.5 text-center w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-4 text-center text-slate-400 italic">
                          Nenhum item de consumo lançado.
                        </td>
                      </tr>
                    ) : (
                      visibleItems.map((row, idx) => (
                        <tr
                          key={row.clientId}
                          onClick={() => setSelectedClientId(row.clientId)}
                          className={`border-b last:border-b-0 cursor-pointer ${
                            selectedClientId === row.clientId
                              ? "bg-sky-500/20"
                              : idx % 2 === 0
                                ? theme.isDark ? "bg-slate-900/40" : "bg-slate-50"
                                : ""
                          } ${row.id ? (theme.isDark ? "text-sky-300" : "text-blue-700") : theme.isDark ? "text-white font-semibold" : "text-slate-900 font-semibold"}`}
                        >
                          <td className="p-1.5">{idx + 1}</td>
                          <td className="p-1.5">{row.productName}</td>
                          <td className="p-1.5">{row.posLocationName || "-"}</td>
                          <td className="p-1.5 text-right font-mono">{row.quantity.toFixed(4)}</td>
                          <td className="p-1.5 text-right font-mono">{fmt(row.unitPrice)}</td>
                          <td className="p-1.5 text-right font-mono font-bold">{fmt(row.totalPrice)}</td>
                          <td className="p-1.5 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteRow(row);
                              }}
                              className="text-red-500 hover:text-red-700 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-950/40"
                              title="Excluir item"
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
            </div>

            {/* Painel lateral: quantidade, valor, código */}
            <div className={`md:col-span-3 border rounded-lg p-3 space-y-3 ${theme.isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"}`}>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Quantidade</label>
                <input
                  type="number"
                  min={0.0001}
                  step="0.0001"
                  value={quantidade}
                  onChange={(e) => setQuantidade(Math.max(0, Number(e.target.value) || 0))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Valor Unit.(R$)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={valorUnit}
                  onChange={(e) => setValorUnit(Math.max(0, Number(e.target.value) || 0))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Total item (R$)</label>
                <input readOnly value={fmt(quantidade * valorUnit)} className={inputClass} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Total Consumo (R$)</label>
                <input readOnly value={fmt(totalConsumo)} className={inputClass} />
              </div>
              <div ref={codeFieldWrapperRef} className="relative">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Cod/Cod.Barras</label>
                <div className="flex items-center gap-1">
                  <input
                    ref={codeInputRef}
                    type="text"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                    onFocus={() => {
                      if (suggestions.length > 0) setShowSuggestions(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.stopPropagation();
                        handleLookupCode();
                      } else if (e.key === "Escape" && showSuggestions) {
                        e.stopPropagation();
                        setShowSuggestions(false);
                      }
                    }}
                    placeholder="Digite para filtrar por nome ou código"
                    autoComplete="off"
                    className={inputClass + " text-left"}
                  />
                  <button
                    onClick={handleLookupCode}
                    disabled={isLookingUp}
                    className="p-2 rounded bg-cyan-600 hover:bg-cyan-500 text-white shrink-0 shadow-sm disabled:opacity-60"
                    title="Buscar produto"
                  >
                    {isLookingUp || isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
                  </button>
                </div>

                {/* Dropdown com o filtro de produtos em tempo real */}
                {showSuggestions && (
                  <div
                    className={`absolute left-0 right-0 top-full mt-1 z-30 rounded-lg border shadow-2xl max-h-64 overflow-y-auto ${
                      theme.isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-300"
                    }`}
                  >
                    {isSearching && suggestions.length === 0 ? (
                      <div className="p-3 text-center text-[11px] text-slate-400">Buscando...</div>
                    ) : suggestions.length === 0 ? (
                      <div className="p-3 text-center text-[11px] text-slate-400">Nenhum produto encontrado.</div>
                    ) : (
                      suggestions.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => selectSuggestion(p)}
                          className={`w-full text-left px-3 py-2 border-b last:border-b-0 transition-colors flex items-center justify-between gap-2 ${
                            theme.isDark ? "border-slate-800 hover:bg-sky-900/40" : "border-slate-100 hover:bg-sky-50"
                          }`}
                        >
                          <span className="text-[11px] font-semibold truncate">{p.name}</span>
                          <span className="text-[11px] font-mono font-bold text-emerald-500 shrink-0">
                            {fmt(parseFloat(String(p.salePrice)) || 0)}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Observação</label>
                <textarea
                  ref={observacaoRef}
                  rows={2}
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  className={`w-full p-1.5 rounded border text-xs outline-none resize-none ${
                    theme.isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Barra de ações estilo WinDev */}
          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={handleCancelarItem} className="px-3 py-2 rounded-lg text-xs font-bold bg-slate-700 hover:bg-slate-600 text-white">
              [F2] Cancelar Item
            </button>
            <button
              disabled
              title="Requer integração com balança de peso (hardware)"
              className="px-3 py-2 rounded-lg text-xs font-bold bg-slate-800 text-slate-500 cursor-not-allowed"
            >
              [F3] Buscar Peso Balança
            </button>
            <button
              disabled
              title="Finalize a conta pelo botão de Pagamento/Check-out da hospedagem"
              className="px-3 py-2 rounded-lg text-xs font-bold bg-slate-800 text-slate-500 cursor-not-allowed"
            >
              [F4] Finalizar Conta
            </button>
            <button
              onClick={handleSalvarLancamentos}
              disabled={isSaving}
              className="px-3 py-2 rounded-lg text-xs font-bold bg-[#0284C7] hover:bg-[#0369A1] text-white shadow-md disabled:opacity-60 flex items-center gap-1.5"
            >
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              [F5] Salvar Lançamentos
            </button>
            <button onClick={handleImprimirConsumo} className="px-3 py-2 rounded-lg text-xs font-bold bg-slate-700 hover:bg-slate-600 text-white flex items-center gap-1.5">
              <Printer className="w-3.5 h-3.5" /> [F6] Imprimir Consumo
            </button>
            <button onClick={() => observacaoRef.current?.focus()} className="px-3 py-2 rounded-lg text-xs font-bold bg-slate-700 hover:bg-slate-600 text-white flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" /> [F7] Observação
            </button>
          </div>
        </div>
      </div>

      {/* Popup de seleção de P.D.V. */}
      {showPdvPopup && (
        <div className="fixed inset-0 z-[75] flex items-start justify-center pt-32 bg-black/40" onClick={() => setShowPdvPopup(false)}>
          <div
            ref={pdvPopupRef}
            tabIndex={-1}
            onKeyDown={handlePdvPopupKeyDown}
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-xs rounded-lg border shadow-2xl overflow-hidden outline-none ${theme.isDark ? "bg-[#0F172A] border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"}`}
          >
            <div className="bg-gradient-to-r from-[#184176] to-[#0284C7] px-3 py-2 flex items-center justify-between text-white">
              <span className="font-bold text-xs">P.D.V.</span>
              <button onClick={() => setShowPdvPopup(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              {posLocations.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">Carregando PDVs...</div>
              ) : (
                <>
                  {posLocations.map((pdv, idx) => (
                    <button
                      key={pdv.id}
                      onClick={() => handleChoosePdv(pdv)}
                      onMouseEnter={() => setPdvSelectedIndex(idx)}
                      className={`w-full text-left px-4 py-2.5 text-xs font-semibold border-b last:border-b-0 transition-colors ${
                        idx === pdvSelectedIndex
                          ? theme.isDark ? "bg-sky-900/50" : "bg-sky-100"
                          : theme.isDark ? "border-slate-800 hover:bg-sky-900/40" : "border-slate-100 hover:bg-sky-50"
                      }`}
                    >
                      {pdv.name}
                    </button>
                  ))}
                  <p className={`px-4 py-1.5 text-[10px] border-t ${theme.isDark ? "border-slate-800 text-slate-500" : "border-slate-100 text-slate-400"}`}>
                    ↑↓ para navegar • Enter para confirmar
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
