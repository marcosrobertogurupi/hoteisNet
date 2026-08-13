"use client";

import { useState } from "react";
import { FileCode, Upload, CheckCircle2, ArrowRight, PackageCheck, AlertCircle, Building2, RefreshCw } from "lucide-react";

export default function TenantNfeImportPage() {
  const [xmlUploaded, setXmlUploaded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [nfeData, setNfeData] = useState<any>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSimulateXmlUpload = () => {
    setIsProcessing(true);

    setTimeout(() => {
      setIsProcessing(false);
      setXmlUploaded(true);
      setNfeData({
        nfeNumber: "NFe-0004921",
        supplierName: "Distribuidora Ambev S.A.",
        supplierCnpj: "02.251.482/0001-00",
        issueDate: "11/08/2026",
        totalAmount: 1840.00,
        items: [
          {
            xmlProdCode: "AMB-10492",
            ean: "7891991000849",
            description: "Cerveja Heineken Long Neck 330ml Cx c/ 24",
            qty: 10, // 10 caixas = 240 garrafas
            unitCost: 4.80,
            mappedProductId: "P-02",
            mappedProductName: "Cerveja Heineken Long Neck",
            status: "MAPPED_AUTOMATICALLY",
          },
          {
            xmlProdCode: "AMB-20891",
            ean: "7891991008890",
            description: "Água Mineral Crystal 500ml Fardo c/ 12",
            qty: 20, // 240 unidades
            unitCost: 1.60,
            mappedProductId: "P-01",
            mappedProductName: "Água Mineral 500ml",
            status: "MAPPED_AUTOMATICALLY",
          },
          {
            xmlProdCode: "AMB-[#9904]",
            ean: "7891991044401",
            description: "Refrigerante Guaraná Antarctica 350ml Cx c/ 12",
            qty: 15,
            unitCost: 2.20,
            mappedProductId: "NEW_PRODUCT",
            mappedProductName: "Cadastrar como Novo Produto",
            status: "DE_PARA_PENDING",
          },
        ],
      });
    }, 800);
  };

  const handleConfirmImport = () => {
    setSuccessMessage(`Nota Fiscal ${nfeData.nfeNumber} importada com sucesso! 480 itens alimentados no Almoxarifado Central e título gerado no Contas a Pagar.`);
    setTimeout(() => {
      setSuccessMessage(null);
      setXmlUploaded(false);
    }, 4000);
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="p-6 rounded-2xl bg-[#0F172A] border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FileCode className="w-5 h-5 text-[#10B981]" />
            Entrada de Estoque via Leitura de NFe Eletrônica (.XML)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Importação automática de notas de compras, De-Para de fornecedores e alimentação do Almoxarifado Central.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-3 py-1.5 rounded-lg bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 font-medium">
            De-Para Inteligente por EAN/CNPJ
          </span>
        </div>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-[#10B981]/15 border border-[#10B981]/40 text-[#10B981] text-xs font-semibold flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Step 1: Upload Box */}
      {!xmlUploaded && (
        <div className="p-12 rounded-2xl bg-[#0F172A] border-2 border-dashed border-slate-700 flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[#10B981]/15 border border-[#10B981]/30 flex items-center justify-center text-[#10B981]">
            <Upload className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">Selecione ou Arraste o arquivo .XML da Nota Fiscal</h3>
            <p className="text-xs text-slate-400">Suporte a NFe modelos 55 (Compra de Fornecedores/Distribuidoras)</p>
          </div>

          <button
            onClick={handleSimulateXmlUpload}
            disabled={isProcessing}
            className="px-6 py-3 bg-[#10B981] hover:bg-[#059669] text-white text-sm font-bold rounded-xl transition-colors shadow-lg shadow-[#10B981]/20 flex items-center gap-2"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Processando XML da NFe...</span>
              </>
            ) : (
              <>
                <FileCode className="w-4 h-4" />
                <span>Simular Upload do Arquivo XML</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Step 2: De-Para & Preview Items */}
      {xmlUploaded && nfeData && (
        <div className="space-y-5">
          {/* Header Info NFe */}
          <div className="p-5 rounded-2xl bg-[#0F172A] border border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <span className="text-base font-bold text-white">{nfeData.supplierName}</span>
                <span className="font-mono text-xs text-[#10B981] bg-[#10B981]/15 px-2 py-0.5 rounded border border-[#10B981]/30">
                  {nfeData.nfeNumber}
                </span>
              </div>
              <span className="text-xs text-slate-400 block font-mono">
                CNPJ: {nfeData.supplierCnpj} • Emitida em {nfeData.issueDate}
              </span>
            </div>

            <div className="text-right">
              <span className="text-xs text-slate-400 block">Valor Total da Nota</span>
              <span className="text-xl font-bold font-mono text-[#10B981]">R$ {nfeData.totalAmount.toFixed(2)}</span>
            </div>
          </div>

          {/* De-Para Table */}
          <div className="rounded-2xl bg-[#0F172A] border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Itens da NFe & Associação De-Para com o Catálogo</h3>
              <span className="text-xs font-mono text-slate-400">3 Itens Identificados</span>
            </div>

            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#1E293B]/60 text-slate-400 text-xs font-mono border-b border-slate-800">
                  <th className="p-3.5">CÓD / ITEM NA NOTA (FORNECEDOR)</th>
                  <th className="p-3.5">QUANTIDADE / CUSTO</th>
                  <th className="p-3.5">DE-PARA (PRODUTO NO ALMOXARIFADO)</th>
                  <th className="p-3.5">STATUS MAPEAMENTO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {nfeData.items.map((item: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3.5">
                      <div className="font-semibold text-white">{item.description}</div>
                      <span className="font-mono text-[10px] text-slate-500">Cód: {item.xmlProdCode} • EAN: {item.ean}</span>
                    </td>
                    <td className="p-3.5 font-mono">
                      <span className="font-bold text-white block">{item.qty} pacotes/cx</span>
                      <span className="text-[10px] text-slate-400">Unit: R$ {item.unitCost.toFixed(2)}</span>
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center gap-2">
                        <ArrowRight className="w-3.5 h-3.5 text-[#10B981]" />
                        <select className="bg-[#1E293B] border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none">
                          <option>{item.mappedProductName}</option>
                          <option>Água Mineral 500ml</option>
                          <option>Cerveja Heineken Long Neck</option>
                          <option>+ Cadastrar como Novo Produto</option>
                        </select>
                      </div>
                    </td>
                    <td className="p-3.5">
                      {item.status === "MAPPED_AUTOMATICALLY" ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 flex items-center gap-1 w-fit">
                          <CheckCircle2 className="w-3 h-3" /> De-Para Automático
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30 flex items-center gap-1 w-fit">
                          <AlertCircle className="w-3 h-3" /> Requer Confirmação
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setXmlUploaded(false)}
              className="px-4 py-2.5 bg-slate-800 text-slate-300 text-sm font-medium rounded-xl hover:bg-slate-700"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmImport}
              className="px-6 py-2.5 bg-[#10B981] hover:bg-[#059669] text-white text-sm font-bold rounded-xl transition-colors shadow-lg shadow-[#10B981]/20 flex items-center gap-2"
            >
              <PackageCheck className="w-4 h-4" />
              <span>Confirmar Importação & Alimentar Almoxarifado</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
