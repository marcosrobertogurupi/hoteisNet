"use client";

import { useState } from "react";
import { FileText, Send, CheckCircle2, ShieldCheck, Printer, AlertTriangle, RefreshCw } from "lucide-react";

export default function TenantFiscalPage() {
  const [issuedInvoices, setIssuedInvoices] = useState([
    {
      id: "NFS-9041",
      type: "NFSE",
      recipientName: "Tech Corp Consultoria LTDA",
      cnpjCpf: "12.345.678/0001-90",
      description: "Serviços de Hospedagem e Diárias (Cód ISS 09.01)",
      value: 1400.00,
      issValue: 70.00, // 5% ISS
      status: "AUTHORIZED",
      protocol: "NFS-GOV-8941029",
      issuedAt: "11/08/2026 11:20",
    },
    {
      id: "NFC-4091",
      type: "NFCE",
      recipientName: "Consumidor Final (Quarto 102)",
      cnpjCpf: "123.456.789-00",
      description: "Venda de Mercadorias de Frigobar (NCM 2202.10.00)",
      value: 76.00,
      issValue: 0.00,
      status: "AUTHORIZED",
      protocol: "SEFAZ-PR-9012384",
      issuedAt: "11/08/2026 11:22",
    },
  ]);

  const [notification, setNotification] = useState<string | null>(null);

  const handleEmitNewInvoice = () => {
    const newInvoice = {
      id: `NFS-${Math.floor(9000 + Math.random() * 900)}`,
      type: "NFSE",
      recipientName: "Carlos Eduardo Silva",
      cnpjCpf: "123.456.789-00",
      description: "Serviços de Hospedagem Hoteleira",
      value: 1050.00,
      issValue: 52.50,
      status: "AUTHORIZED",
      protocol: `NFS-GOV-${Math.floor(100000 + Math.random() * 900000)}`,
      issuedAt: new Date().toLocaleString(),
    };

    setIssuedInvoices([newInvoice, ...issuedInvoices]);
    setNotification("NFSe transmitida com sucesso para a SEFAZ / Prefeitura! Protocolo de autorização gerado.");

    setTimeout(() => setNotification(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="p-6 rounded-2xl bg-[#0F172A] border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#38BDF8]" />
            Módulo Fiscal (Emissão NFSe Hospedagem & NFCe Vendas PDV)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Transmissão automática de notas fiscais eletrônicas de serviços de hospedagem e vendas de balcão/frigobar.
          </p>
        </div>

        <button
          onClick={handleEmitNewInvoice}
          className="px-4 py-2.5 bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold text-sm rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-[#0284C7]/20"
        >
          <Send className="w-4 h-4" /> Emitir NFSe de Teste
        </button>
      </div>

      {/* Notification */}
      {notification && (
        <div className="p-4 rounded-xl bg-[#10B981]/15 border border-[#10B981]/40 text-[#10B981] text-xs font-semibold flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4" />
          <span>{notification}</span>
        </div>
      )}

      {/* Issued Invoices Table */}
      <div className="rounded-2xl bg-[#0F172A] border border-slate-800 overflow-hidden space-y-4">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Documentos Fiscais Transmitidos</h3>
          <span className="text-xs font-mono text-[#10B981]">SEFAZ / Prefeitura Conectadas</span>
        </div>

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#1E293B]/60 text-slate-400 text-xs font-mono border-b border-slate-800">
              <th className="p-3.5">NÚMERO / TIPO</th>
              <th className="p-3.5">TOMADOR / DESTINATÁRIO</th>
              <th className="p-3.5">SERVIÇO / PRODUTO</th>
              <th className="p-3.5">VALOR TOTAL</th>
              <th className="p-3.5">PROTOCOLO SEFAZ</th>
              <th className="p-3.5">STATUS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-xs">
            {issuedInvoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-slate-800/40 transition-colors">
                <td className="p-3.5">
                  <div className="font-bold text-white">{inv.id}</div>
                  <span className="text-[10px] font-mono text-[#38BDF8]">{inv.type}</span>
                </td>
                <td className="p-3.5">
                  <div className="font-semibold text-slate-200">{inv.recipientName}</div>
                  <span className="font-mono text-[10px] text-slate-500">{inv.cnpjCpf}</span>
                </td>
                <td className="p-3.5 text-slate-300">{inv.description}</td>
                <td className="p-3.5 font-mono font-bold text-white">R$ {inv.value.toFixed(2)}</td>
                <td className="p-3.5 font-mono text-slate-400">{inv.protocol}</td>
                <td className="p-3.5">
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
                    Autorizada
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
