"use client";

import React from "react";
import { X, Printer } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

export interface ResumoRoomData {
  number: string;
  category?: string;
  guestName: string;
  cpf?: string;
  cep?: string;
  address?: string;
  neighborhood?: string;
  city?: string;
  uf?: string;
  phone?: string;
  checkInDate: string; // e.g. "23/01/2026 21:18:49"
  prevCheckOutDate: string; // e.g. "24/01/2026 14:00:00"
  calculatedUntil?: string; // e.g. "11/08/2026 16:37:11"
  diariasCount?: number;
  totalDiarias?: number;
  totalConsumo?: number;
  outrosDebitos?: number;
  totalDespesas?: number;
  pagamentosAmount?: number;
  totalAFaturar?: number;
  descontos?: number;
  saldoAPagar?: number;
  companyData?: {
    cnpj?: string;
    companyName?: string;
    ie?: string;
    address?: string;
    neighborhood?: string;
    city?: string;
    uf?: string;
  };
  consumptionItems?: Array<{
    dateTime: string;
    description: string;
    unitPrice: number;
    quantity: number;
    totalPrice: number;
  }>;
  paymentItems?: Array<{
    dateTime: string;
    amount: number;
    paymentMethod: string;
  }>;
}

interface ImprimirResumoHospedagemModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomData: ResumoRoomData;
}

export const ImprimirResumoHospedagemModal: React.FC<ImprimirResumoHospedagemModalProps> = ({
  isOpen,
  onClose,
  roomData,
}) => {
  const { hotelName, hotelLogo, showLogoInPrint } = useTheme();

  const totalDiarias = roomData.totalDiarias ?? 28140.0;
  const totalConsumo = roomData.totalConsumo ?? 62.0;
  const outrosDebitos = roomData.outrosDebitos ?? 0.0;
  const totalDespesas = roomData.totalDespesas ?? totalDiarias + totalConsumo + outrosDebitos;
  const pagamentos = roomData.pagamentosAmount ?? 0.0;
  const totalAFaturar = roomData.totalAFaturar ?? 0.0;
  const descontos = roomData.descontos ?? 0.0;
  const saldoAPagar = roomData.saldoAPagar ?? totalDespesas - pagamentos - descontos;

  const consumptions = roomData.consumptionItems ?? [
    { dateTime: "31/01/2026 12:31:35", description: "REFRIG LATA", unitPrice: 6.0, quantity: 1.0, totalPrice: 6.0 },
    { dateTime: "31/01/2026 12:31:35", description: "LAV PEÇA GRANDE", unitPrice: 7.0, quantity: 8.0, totalPrice: 56.0 },
  ];

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:p-0 print:bg-transparent print:static print:block">
      {/* WINDOW CONTAINER */}
      <div className="bg-white text-slate-900 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] border border-slate-300 print:max-h-none print:h-auto print:shadow-none print:border-none print:rounded-none print:w-full print:p-0">
        
        {/* Header Bar */}
        <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-sky-400" />
            <h3 className="font-bold text-sm tracking-wide">Relatório de Resumo da Hospedagem</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Printer className="w-3.5 h-3.5" /> Imprimir Resumo
            </button>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* PRINTABLE DOCUMENT BODY (Replicating resumo da hospedagem.pdf) */}
        <div className="p-6 overflow-y-auto space-y-3 font-sans text-xs bg-white text-slate-900 print:p-0 print:overflow-visible print:max-h-none print:h-auto print:static">
          
          {/* HOTEL HEADER */}
          <div className="text-center pb-1">
            <div className="flex items-center justify-center gap-3 mb-0.5">
              {showLogoInPrint && hotelLogo && (
                <img src={hotelLogo} alt={hotelName} className="h-10 w-auto object-contain" />
              )}
              <h1 className="text-xl font-bold text-slate-900 tracking-tight uppercase">
                {hotelName || "HOTEL IDEAL"} - 40.904.811/0001-31
              </h1>
            </div>
            <p className="text-[11px] text-slate-700 font-mono">
              RUA MARECHAL RONDON, SN - ALTO PARANA - REDENCAO - PA CEP: 68550303 - (063) 3415-4614
            </p>
            <div className="h-1.5 bg-black w-full mt-2 mb-3"></div>
          </div>

          {/* BOX 1: DADOS DO HÓSPEDE */}
          <div className="border border-slate-900 p-2.5 space-y-1 bg-white text-xs font-mono avoid-break">
            <div className="font-bold text-slate-900 border-b border-slate-300 pb-1 mb-1 text-xs">
              Dados do hospede:
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div>
                <span className="font-semibold text-slate-600">Dt.Cheg.:</span>{" "}
                <span>{roomData.checkInDate || "23/01/2026 21:18:49"}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-600">Dt.Prev.Sai.:</span>{" "}
                <span>{roomData.prevCheckOutDate || "24/01/2026 14:00:00"}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-600">DD:</span>{" "}
                <span>{roomData.diariasCount || 1}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-600">Calculado ate:</span>{" "}
                <span>{roomData.calculatedUntil || "11/08/2026 16:37:11"}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <span className="font-semibold text-slate-600">Quarto:</span>{" "}
                <span className="font-bold">{roomData.number || "310"}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-600">CPF:</span>{" "}
                <span>{roomData.cpf || "865.172.281-87"}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-600">Hosp.Principal:</span>{" "}
                <span className="font-bold">{roomData.guestName || "FAUSTO DE OLIVEIRA DA COSTA"}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <span className="font-semibold text-slate-600">CEP:</span>{" "}
                <span>{roomData.cep || "74660040"}</span>
              </div>
              <div className="md:col-span-2">
                <span className="font-semibold text-slate-600">Logradouro:</span>{" "}
                <span>{roomData.address || "CORIOLANDO A LOYOLA"}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <span className="font-semibold text-slate-600">Bairro:</span>{" "}
                <span>{roomData.neighborhood || "ST CRIMEIA LESTE"}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-600">Cidade:</span>{" "}
                <span>{roomData.city || "GOIANIA"}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-600">U.F.:</span>{" "}
                <span>{roomData.uf || "GO"}</span>
                <span className="ml-4 font-semibold text-slate-600">Passaporte:</span> <span>-</span>
              </div>
            </div>
          </div>

          {/* BOX 2: EMPRESA CONVENIADA */}
          <div className="border border-slate-900 p-2.5 space-y-1 bg-white text-xs font-mono avoid-break">
            <div className="font-bold text-slate-900 border-b border-slate-300 pb-1 mb-1 text-xs">
              Empresa conveniada:
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <span className="font-semibold text-slate-600">CNPJ:</span>{" "}
                <span>{roomData.companyData?.cnpj || ""}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-600">Empresa:</span>{" "}
                <span>{roomData.companyData?.companyName || ""}</span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <span className="font-semibold text-slate-600">I.E.:</span>{" "}
                <span>{roomData.companyData?.ie || ""}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-600">Logradouro:</span>{" "}
                <span>{roomData.companyData?.address || ""}</span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <span className="font-semibold text-slate-600">Bairro:</span>{" "}
                <span>{roomData.companyData?.neighborhood || ""}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-600">Cidade:</span>{" "}
                <span>{roomData.companyData?.city || ""}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-600">U.F.:</span>{" "}
                <span>{roomData.companyData?.uf || ""}</span>
              </div>
            </div>
          </div>

          {/* BOX 3: CONSUMO DA HOSPEDAGEM */}
          <div className="space-y-1 font-mono text-xs avoid-break">
            <div className="font-bold text-slate-900 border-b border-slate-300 pb-1 text-xs">
              Consumo da hospedagem:
            </div>
            <table className="w-full text-left text-xs border-collapse border border-slate-900">
              <tbody>
                {consumptions.map((item, idx) => (
                  <tr key={idx} className="border-b border-slate-300">
                    <td className="p-1.5 text-slate-800 w-44">{item.dateTime}</td>
                    <td className="p-1.5 text-slate-900">{item.description}</td>
                    <td className="p-1.5 text-right w-24">R$ {item.unitPrice.toFixed(2).replace(".", ",")}</td>
                    <td className="p-1.5 text-center w-20">{item.quantity.toFixed(2).replace(".", ",")}</td>
                    <td className="p-1.5 text-right w-28 font-semibold">R$ {item.totalPrice.toFixed(2).replace(".", ",")}</td>
                  </tr>
                ))}
                {consumptions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-3 text-center text-slate-400 italic">Nenhum consumo registrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* BOX 4: TOTAIS DA HOSPEDAGEM */}
          <div className="border border-slate-900 p-2.5 bg-white text-xs font-mono avoid-break">
            <div className="font-bold text-slate-900 border-b border-slate-300 pb-1 text-xs mb-2">
              Totais da hospedagem
            </div>
            <div className="grid grid-cols-2 gap-8 text-xs">
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>Total diarias(R$)..:</span>
                  <span className="font-semibold">R$ {totalDiarias.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span>Outros debitos(R$).:</span>
                  <span className="font-semibold">R$ {outrosDebitos.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>Total consumo(R$)..:</span>
                  <span className="font-semibold">R$ {totalConsumo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900 pt-0.5">
                  <span>Total despesas (R$):</span>
                  <span>R$ {totalDespesas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          </div>

          {/* BOX 5: PAGAMENTOS */}
          <div className="space-y-2 font-mono text-xs avoid-break">
            <div className="font-bold text-slate-900 border-b border-slate-300 pb-1 text-xs">
              Pagamentos:
            </div>

            <div className="grid grid-cols-3 text-[11px] font-semibold border-b border-slate-300 pb-1 text-slate-700">
              <div>Data/Hora</div>
              <div>Valor(R$)</div>
              <div>Forma pagamento</div>
            </div>

            <div className="pt-1 space-y-1 text-xs w-80">
              <div className="flex justify-between">
                <span>Pagamentos(R$)..:</span>
                <span className="font-semibold">R$ {pagamentos.toFixed(2).replace(".", ",")}</span>
              </div>
              <div className="flex justify-between">
                <span>Total a faturar:</span>
                <span className="font-semibold">R$ {totalAFaturar.toFixed(2).replace(".", ",")}</span>
              </div>
              <div className="flex justify-between">
                <span>Descontos......:</span>
                <span className="font-semibold">R$ {descontos.toFixed(2).replace(".", ",")}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-400 font-bold text-slate-900">
                <span>Saldo a pagar..:</span>
                <span>R$ {saldoAPagar.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* SIGNATURE LINE */}
          <div className="pt-12 pb-2 text-center avoid-break">
            <div className="h-1 bg-black w-full max-w-xl mx-auto mb-1"></div>
            <div className="font-mono font-bold text-xs italic text-slate-900">
              Assinatura do hospede
            </div>
          </div>

        </div>

        {/* FOOTER ACTION BAR */}
        <div className="bg-slate-100 border-t border-slate-300 p-3 flex items-center justify-between print:hidden">
          <span className="text-[11px] text-slate-500 font-mono">HoteisNet Resumo da Hospedagem</span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold">
              Fechar Janela
            </button>
            <button onClick={handlePrint} className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5">
              <Printer className="w-4 h-4" /> Imprimir Documento
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
