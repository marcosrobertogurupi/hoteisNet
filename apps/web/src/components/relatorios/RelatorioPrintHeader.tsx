"use client";

interface RelatorioPrintHeaderProps {
  hotelName: string;
  hotelCnpj?: string;
  hotelAddress?: string;
  hotelLogo?: string | null;
  showLogo?: boolean;
  title: string;
}

// Cabeçalho padrão dos relatórios impressos do assinante, replicando o layout dos relatórios do
// sistema legado (nome do hotel + CNPJ na mesma linha, endereço logo abaixo, filete preto e o
// título do relatório).
export default function RelatorioPrintHeader({
  hotelName,
  hotelCnpj,
  hotelAddress,
  hotelLogo,
  showLogo,
  title,
}: RelatorioPrintHeaderProps) {
  return (
    <div className="text-center pb-2 avoid-break">
      <div className="flex items-center justify-center gap-3 mb-0.5">
        {showLogo && hotelLogo && (
          <img src={hotelLogo} alt={hotelName} className="h-10 w-auto object-contain" />
        )}
        <h1 className="text-xl font-bold text-slate-900 tracking-tight uppercase">
          {hotelName || "HOTEL"}
          {hotelCnpj ? ` - ${hotelCnpj}` : ""}
        </h1>
      </div>
      {hotelAddress && (
        <p className="text-[11px] text-slate-700 font-mono">{hotelAddress}</p>
      )}
      <div className="h-1.5 bg-black w-full mt-2 mb-2" />
      <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">{title}</h2>
    </div>
  );
}
