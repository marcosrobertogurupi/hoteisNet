"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Package, Plus, Search, Edit3, Trash2, ArrowLeft, X, Check, Store, Tags } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useConfirm } from "@/context/ConfirmContext";
import { useToast } from "@/context/ToastContext";
import LoadingOverlay from "@/components/LoadingOverlay";
import { cadastroUI } from "../_ui";

interface Ref {
  id: string;
  name: string;
}

interface Produto {
  id: string;
  referencia: string | null;
  nome: string;
  codigoBarras: string | null;
  unidade: string | null;
  marca: string | null;
  precoCusto: number;
  precoVenda: number;
  estoqueGeral: number;
  estoqueMinimo: number;
  estoqueMaximo: number | null;
  grupo: Ref | null;
  tipo: Ref | null;
  perfilFiscal: Ref | null;
}

const EMPTY_FORM = {
  id: "",
  referencia: "",
  nome: "",
  codigoBarras: "",
  grupoId: "",
  tipoId: "",
  unidade: "UN",
  marca: "",
  precoCusto: "",
  precoVenda: "",
  estoqueMinimo: "0",
  estoqueMaximo: "",
  perfilFiscalId: "",
};

const UNIDADES = ["UN", "CX", "PC", "KG", "G", "L", "ML", "DZ", "FD", "PT"];

export default function ProdutosPage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const c = cadastroUI(isDark);
  const confirmDialog = useConfirm();
  const toast = useToast();

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [grupos, setGrupos] = useState<Ref[]>([]);
  const [tipos, setTipos] = useState<Ref[]>([]);
  const [perfis, setPerfis] = useState<Ref[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const syncProdutos = useCallback(async () => {
    try {
      const res = await fetch("/api/cadastros/produtos");
      const data = await res.json();
      if (data?.success && Array.isArray(data.products)) setProdutos(data.products);
    } catch (err) {
      console.warn("[CadastroProdutos] Erro ao buscar produtos:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    syncProdutos();
    fetch("/api/cadastros/grupos?type=PRODUTO&active=1")
      .then((r) => r.json())
      .then((d) => d?.success && setGrupos(d.groups.map((g: any) => ({ id: g.id, name: g.name }))))
      .catch(() => {});
    fetch("/api/cadastros/tipos-produto?active=1")
      .then((r) => r.json())
      .then((d) => d?.success && setTipos(d.types.map((t: any) => ({ id: t.id, name: t.name }))))
      .catch(() => {});
    fetch("/api/pdv/perfis-fiscais")
      .then((r) => r.json())
      .then((d) => d?.success && setPerfis((d.perfis || []).map((p: any) => ({ id: p.id, name: p.name }))))
      .catch(() => {});
  }, [syncProdutos]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return produtos;
    return produtos.filter(
      (p) =>
        p.nome.toLowerCase().includes(q) ||
        (p.referencia || "").toLowerCase().includes(q) ||
        (p.codigoBarras || "").includes(q) ||
        (p.grupo?.name || "").toLowerCase().includes(q)
    );
  }, [produtos, searchQuery]);

  const handleOpenAdd = () => {
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: Produto) => {
    setForm({
      id: p.id,
      referencia: p.referencia || "",
      nome: p.nome,
      codigoBarras: p.codigoBarras || "",
      grupoId: p.grupo?.id || "",
      tipoId: p.tipo?.id || "",
      unidade: p.unidade || "UN",
      marca: p.marca || "",
      precoCusto: String(p.precoCusto ?? ""),
      precoVenda: String(p.precoVenda ?? ""),
      estoqueMinimo: String(p.estoqueMinimo ?? "0"),
      estoqueMaximo: p.estoqueMaximo == null ? "" : String(p.estoqueMaximo),
      perfilFiscalId: p.perfilFiscal?.id || "",
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (p: Produto) => {
    const ok = await confirmDialog({
      title: "Excluir Produto",
      message: `Excluir o produto "${p.nome}"?`,
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;

    const res = await fetch(`/api/cadastros/produtos?id=${p.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!data.success) {
      toast.error(data.error || "Não foi possível excluir o produto.");
      return;
    }
    toast.success("Produto excluído com sucesso.");
    await syncProdutos();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) return toast.warning("Preencha o nome do produto.");
    if (!form.grupoId) return toast.warning("Selecione o grupo do produto.");

    setSaving(true);
    try {
      const res = await fetch("/api/cadastros/produtos", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Não foi possível salvar o produto.");
        return;
      }
      toast.success(form.id ? "Produto atualizado com sucesso." : "Produto cadastrado com sucesso.");
      await syncProdutos();
      setIsModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const semGrupoCadastrado = grupos.length === 0;

  return (
    <div className={c.page(theme.bgApp, theme.textMain)}>
      <LoadingOverlay show={isLoading} message="Buscando produtos..." submessage="Carregando o cadastro de produtos." />
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/app/cadastros" className={c.backLink}>
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
          <span
            className={`text-xs font-mono px-3 py-1 rounded-full font-bold border ${
              isDark ? "bg-orange-500/10 text-orange-300 border-orange-500/20" : "bg-orange-50 text-orange-700 border-orange-200"
            }`}
          >
            {produtos.length} produto(s)
          </span>
        </div>

        <div className={c.headerCard}>
          <div className="flex items-center gap-4">
            <div
              className={`p-3.5 border rounded-2xl ${
                isDark ? "bg-orange-500/10 border-orange-500/20 text-orange-300" : "bg-orange-50 border-orange-200 text-orange-600"
              }`}
            >
              <Package className="w-8 h-8" />
            </div>
            <div>
              <h1 className={c.title}>Cadastro e Manutenção de Produtos</h1>
              <p className={c.subtitle}>
                Itens de frigobar, bar e revenda. A classificação vem sempre das listas cadastradas de Grupos e Tipos — nunca texto livre.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/app/stock" className={c.ghostBtn}>
              <Store className="w-4 h-4" /> Estoque por PDV
            </Link>
            <button
              onClick={handleOpenAdd}
              className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-orange-600/20 transition"
            >
              <Plus className="w-4 h-4" /> Novo Produto
            </button>
          </div>
        </div>

        {semGrupoCadastrado && !isLoading && (
          <div
            className={`p-4 rounded-2xl border text-xs flex items-center gap-2 ${
              isDark ? "bg-amber-500/10 border-amber-500/20 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-700"
            }`}
          >
            <Tags className="w-4 h-4 shrink-0" />
            Nenhum grupo de produto cadastrado.{" "}
            <Link href="/app/cadastros/grupos" className="underline font-semibold">
              Cadastre um grupo
            </Link>{" "}
            antes de incluir produtos.
          </div>
        )}

        <div className={c.toolbar}>
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 absolute left-3.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nome, referência, código de barras ou grupo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`${c.input} pl-10 pr-4 py-2`}
            />
          </div>
          <span className={`text-xs font-mono ${c.muted}`}>
            Exibindo: <strong className={c.strong}>{filtered.length}</strong>
          </span>
        </div>

        <div className={c.tableCard}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className={c.thead}>
                <tr>
                  <th className="px-5 py-3.5">Referência / Produto</th>
                  <th className="px-5 py-3.5">Grupo</th>
                  <th className="px-5 py-3.5">Tipo</th>
                  <th className="px-5 py-3.5 text-center">Un.</th>
                  <th className="px-5 py-3.5 text-right">Custo</th>
                  <th className="px-5 py-3.5 text-right">Venda</th>
                  <th className="px-5 py-3.5 text-center">Est. Geral</th>
                  <th className="px-5 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${c.tdivide}`}>
                {filtered.map((p) => (
                  <tr key={p.id} className={`transition ${c.rowHover}`}>
                    <td className="px-5 py-4">
                      <span className={`font-bold text-sm block ${c.strong}`}>{p.nome}</span>
                      <span className={`font-mono text-[10px] ${c.muted}`}>
                        Ref: {p.referencia || "-"}
                        {p.codigoBarras ? ` · Cód: ${p.codigoBarras}` : ""}
                      </span>
                    </td>
                    <td className={`px-5 py-4 font-medium ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                      {p.grupo?.name || <span className="text-rose-500">sem grupo</span>}
                    </td>
                    <td className={`px-5 py-4 ${c.muted}`}>{p.tipo?.name || "-"}</td>
                    <td className={`px-5 py-4 text-center font-mono ${c.muted}`}>{p.unidade || "UN"}</td>
                    <td className={`px-5 py-4 text-right font-mono ${c.muted}`}>R$ {p.precoCusto.toFixed(2)}</td>
                    <td className="px-5 py-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      R$ {p.precoVenda.toFixed(2)}
                    </td>
                    <td className={`px-5 py-4 text-center font-mono ${c.muted}`}>{p.estoqueGeral}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEdit(p)}
                          className={`p-2 rounded-xl transition ${
                            isDark ? "bg-slate-800 text-orange-300 hover:bg-orange-600 hover:text-white" : "bg-slate-100 text-orange-700 hover:bg-orange-600 hover:text-white"
                          }`}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(p)}
                          className={`p-2 rounded-xl transition ${
                            isDark ? "bg-slate-800 text-rose-400 hover:bg-rose-600 hover:text-white" : "bg-slate-100 text-rose-600 hover:bg-rose-600 hover:text-white"
                          }`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filtered.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={8} className={`px-5 py-12 text-center ${c.empty}`}>
                      {searchQuery ? "Nenhum produto encontrado para a busca." : "Nenhum produto cadastrado."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className={c.modalBackdrop}>
          <div className={`${c.modalCard} max-w-2xl max-h-[90vh] overflow-y-auto`}>
            <div className={`p-6 border-b flex items-center justify-between sticky top-0 ${isDark ? "bg-slate-900" : "bg-white"} ${c.modalDivider}`}>
              <h2 className="text-lg font-bold">{form.id ? "Editar Produto" : "Novo Produto"}</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className={`p-2 rounded-xl transition ${isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-500 hover:text-slate-900 hover:bg-slate-200"}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-6 gap-4">
                <div className="space-y-1.5 col-span-2">
                  <label className={c.label}>Referência</label>
                  <input type="text" value={form.referencia} onChange={(e) => setForm({ ...form, referencia: e.target.value })} className={c.field} />
                </div>
                <div className="space-y-1.5 col-span-4">
                  <label className={c.label}>
                    Nome <span className="text-rose-500">*</span>
                  </label>
                  <input type="text" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={c.field} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={c.label}>
                    Grupo <span className="text-rose-500">*</span>
                  </label>
                  <select required value={form.grupoId} onChange={(e) => setForm({ ...form, grupoId: e.target.value })} className={c.field}>
                    <option value="">Selecione...</option>
                    {grupos.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={c.label}>Tipo de Produto</label>
                  <select value={form.tipoId} onChange={(e) => setForm({ ...form, tipoId: e.target.value })} className={c.field}>
                    <option value="">— Sem tipo —</option>
                    {tipos.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-6 gap-4">
                <div className="space-y-1.5 col-span-2">
                  <label className={c.label}>Unidade</label>
                  <select value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} className={c.field}>
                    {UNIDADES.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5 col-span-4">
                  <label className={c.label}>Marca</label>
                  <input type="text" value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} className={c.field} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={c.label}>Preço de Custo (R$)</label>
                  <input type="number" step="0.01" min="0" value={form.precoCusto} onChange={(e) => setForm({ ...form, precoCusto: e.target.value })} className={c.field} />
                </div>
                <div className="space-y-1.5">
                  <label className={c.label}>Preço de Venda (R$)</label>
                  <input type="number" step="0.01" min="0" value={form.precoVenda} onChange={(e) => setForm({ ...form, precoVenda: e.target.value })} className={c.field} />
                </div>
              </div>

              <div className="grid grid-cols-6 gap-4">
                <div className="space-y-1.5 col-span-2">
                  <label className={c.label}>Estoque Mínimo</label>
                  <input type="number" min="0" step="1" value={form.estoqueMinimo} onChange={(e) => setForm({ ...form, estoqueMinimo: e.target.value })} className={c.field} />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className={c.label}>Estoque Máximo</label>
                  <input type="number" min="0" step="1" value={form.estoqueMaximo} onChange={(e) => setForm({ ...form, estoqueMaximo: e.target.value })} className={c.field} placeholder="opcional" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className={c.label}>Código de Barras</label>
                  <input type="text" value={form.codigoBarras} onChange={(e) => setForm({ ...form, codigoBarras: e.target.value })} className={c.field} />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className={c.label}>Perfil Fiscal (NFC-e / NF-e)</label>
                <select value={form.perfilFiscalId} onChange={(e) => setForm({ ...form, perfilFiscalId: e.target.value })} className={c.field}>
                  <option value="">— Sem perfil (não emite cupom até configurar) —</option>
                  {perfis.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <p className={`text-[10px] ${c.muted}`}>
                  Códigos de barras adicionais e o estoque por PDV são gerenciados na tela Estoque por PDV.
                </p>
              </div>

              <div className={`pt-2 flex items-center justify-end gap-3 border-t ${c.modalDivider}`}>
                <button type="button" onClick={() => setIsModalOpen(false)} className={c.ghostBtn}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-orange-600/20 transition"
                >
                  <Check className="w-4 h-4" /> {saving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
