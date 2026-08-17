import { jsPDF } from "jspdf";
import { valorPorExtenso } from "./valorPorExtenso";

export interface PdfExtratoData {
  hotelName: string;
  hotelCnpj?: string;
  hotelAddress?: string;
  roomNumber: string;
  guestName: string;
  cpf?: string;
  address?: string;
  cityUf?: string;
  checkInDate: string;
  checkOutDate: string;
  startDateFiltered: string;
  endDateFiltered: string;
  tariffs: Array<{
    description: string;
    startDate: string;
    endDate: string;
    dailyRate: number;
  }>;
  consumptions: Array<{
    dateTime: string;
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  totals: {
    totalDiarias: number;
    totalConsumo: number;
    outrosDebitos: number;
    adiantamento: number;
    desconto: number;
    totalDespesas: number;
    adianMaisDesconto: number;
    saldoAPagar: number;
  };
}

/**
 * Generates a styled PDF for Extrato de Hospedagem and returns it as a Data URL (base64 string).
 */
export function generateExtratoPdfBase64(data: PdfExtratoData): string {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 12;

  // --- HEADER HOTEL ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text((data.hotelName || "HOTEL IDEAL").toUpperCase(), pageWidth / 2, y, { align: "center" });

  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const cnpjStr = data.hotelCnpj ? ` - CNPJ: ${data.hotelCnpj}` : " - CNPJ: 40.904.811/0001-31";
  const addrStr = data.hotelAddress || "RUA MARECHAL RONDON, SN - ALTO PARANA - REDENCAO - PA CEP: 68550303 - (063) 3415-4614";
  doc.text(`${addrStr}${cnpjStr}`, pageWidth / 2, y, { align: "center" });

  y += 4;
  doc.setLineWidth(0.5);
  doc.line(10, y, pageWidth - 10, y);

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("EXTRATO DE HOSPEDAGEM", pageWidth / 2, y, { align: "center" });

  // --- BOX DADOS DO HÓSPEDE E HOSPEDAGEM ---
  y += 6;
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");

  doc.rect(10, y, pageWidth - 20, 24);
  const boxY = y + 4;

  doc.setFont("helvetica", "bold");
  doc.text("Quarto:", 13, boxY);
  doc.setFont("helvetica", "normal");
  doc.text(data.roomNumber || "102", 26, boxY);

  doc.setFont("helvetica", "bold");
  doc.text("Hóspede Principal:", 55, boxY);
  doc.setFont("helvetica", "normal");
  doc.text(data.guestName || "Marcos Oliveira", 85, boxY);

  doc.setFont("helvetica", "bold");
  doc.text("CPF:", 155, boxY);
  doc.setFont("helvetica", "normal");
  doc.text(data.cpf || "000.000.000-00", 163, boxY);

  const boxY2 = boxY + 6;
  doc.setFont("helvetica", "bold");
  doc.text("Dt. Entr.:", 13, boxY2);
  doc.setFont("helvetica", "normal");
  doc.text(data.checkInDate || "-", 28, boxY2);

  doc.setFont("helvetica", "bold");
  doc.text("Dt. Saída:", 75, boxY2);
  doc.setFont("helvetica", "normal");
  doc.text(data.checkOutDate || "-", 90, boxY2);

  doc.setFont("helvetica", "bold");
  doc.text("Período Extrato:", 135, boxY2);
  doc.setFont("helvetica", "normal");
  doc.text(`${data.startDateFiltered} a ${data.endDateFiltered}`, 160, boxY2);

  const boxY3 = boxY2 + 6;
  doc.setFont("helvetica", "bold");
  doc.text("Endereço:", 13, boxY3);
  doc.setFont("helvetica", "normal");
  doc.text(data.address || "-", 30, boxY3);

  doc.setFont("helvetica", "bold");
  doc.text("Cidade/UF:", 135, boxY3);
  doc.setFont("helvetica", "normal");
  doc.text(data.cityUf || "Palmas/TO", 153, boxY3);

  y += 28;

  // --- TABELA DE DIÁRIAS ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("DETALHAMENTO DE DIÁRIAS (PERÍODO APLICADO)", 10, y);

  y += 3;
  doc.setFillColor(240, 240, 240);
  doc.rect(10, y, pageWidth - 20, 6, "F");
  doc.rect(10, y, pageWidth - 20, 6, "S");

  doc.setFontSize(8);
  doc.text("Descrição Tarifa", 12, y + 4);
  doc.text("Data Inicial", 85, y + 4);
  doc.text("Data Final", 125, y + 4);
  doc.text("Valor Diária (R$)", pageWidth - 12, y + 4, { align: "right" });

  y += 6;
  doc.setFont("helvetica", "normal");
  const tariffs = data.tariffs.length > 0 ? data.tariffs : [
    { description: "DIÁRIA PADRÃO", startDate: data.startDateFiltered, endDate: data.endDateFiltered, dailyRate: data.totals.totalDiarias }
  ];

  tariffs.forEach((t) => {
    if (y > 260) {
      doc.addPage();
      y = 15;
    }
    doc.text(t.description, 12, y + 4);
    doc.text(t.startDate, 85, y + 4);
    doc.text(t.endDate, 125, y + 4);
    doc.text(`R$ ${t.dailyRate.toFixed(2).replace(".", ",")}`, pageWidth - 12, y + 4, { align: "right" });
    y += 5;
    doc.setLineWidth(0.1);
    doc.line(10, y, pageWidth - 10, y);
  });

  doc.setFont("helvetica", "bold");
  doc.text(`Total Diárias: R$ ${data.totals.totalDiarias.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, pageWidth - 12, y + 5, { align: "right" });

  y += 8;

  // --- TABELA DE CONSUMO ---
  if (data.consumptions && data.consumptions.length > 0) {
    if (y > 240) {
      doc.addPage();
      y = 15;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("RELAÇÃO DE CONSUMO (PRODUTOS E SERVIÇOS)", 10, y);

    y += 3;
    doc.setFillColor(240, 240, 240);
    doc.rect(10, y, pageWidth - 20, 6, "F");
    doc.rect(10, y, pageWidth - 20, 6, "S");

    doc.setFontSize(8);
    doc.text("Data/Hora", 12, y + 4);
    doc.text("Descrição", 55, y + 4);
    doc.text("Qtd", 125, y + 4);
    doc.text("Vlr Unit (R$)", 150, y + 4);
    doc.text("Total (R$)", pageWidth - 12, y + 4, { align: "right" });

    y += 6;
    doc.setFont("helvetica", "normal");
    data.consumptions.forEach((c) => {
      if (y > 260) {
        doc.addPage();
        y = 15;
      }
      doc.text(c.dateTime, 12, y + 4);
      doc.text(c.description, 55, y + 4);
      doc.text(c.quantity.toFixed(2), 125, y + 4);
      doc.text(`R$ ${c.unitPrice.toFixed(2).replace(".", ",")}`, 150, y + 4);
      doc.text(`R$ ${c.totalPrice.toFixed(2).replace(".", ",")}`, pageWidth - 12, y + 4, { align: "right" });
      y += 5;
      doc.line(10, y, pageWidth - 10, y);
    });

    doc.setFont("helvetica", "bold");
    doc.text(`Total Consumo: R$ ${data.totals.totalConsumo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, pageWidth - 12, y + 5, { align: "right" });
    y += 8;
  }

  // --- RESUMO FINANCEIRO DOS TOTAIS ---
  if (y > 230) {
    doc.addPage();
    y = 15;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("RESUMO FINANCEIRO DA HOSPEDAGEM", 10, y);

  y += 3;
  doc.rect(10, y, pageWidth - 20, 32);

  doc.setFontSize(8);
  let fy = y + 5;

  const col1X = 15;
  const col2X = 110;

  doc.setFont("helvetica", "normal");
  doc.text("Total Consumo (R$):", col1X, fy);
  doc.setFont("helvetica", "bold");
  doc.text(`R$ ${data.totals.totalConsumo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, col1X + 40, fy);

  doc.setFont("helvetica", "normal");
  doc.text("Adiantamento (R$):", col2X, fy);
  doc.setFont("helvetica", "bold");
  doc.text(`R$ ${data.totals.adiantamento.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, col2X + 45, fy);

  fy += 6;
  doc.setFont("helvetica", "normal");
  doc.text("Total Diárias (R$):", col1X, fy);
  doc.setFont("helvetica", "bold");
  doc.text(`R$ ${data.totals.totalDiarias.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, col1X + 40, fy);

  doc.setFont("helvetica", "normal");
  doc.text("Desconto (R$):", col2X, fy);
  doc.setFont("helvetica", "bold");
  doc.text(`R$ ${data.totals.desconto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, col2X + 45, fy);

  fy += 6;
  doc.setFont("helvetica", "normal");
  doc.text("Outros Débitos (R$):", col1X, fy);
  doc.setFont("helvetica", "bold");
  doc.text(`R$ ${data.totals.outrosDebitos.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, col1X + 40, fy);

  doc.setFont("helvetica", "normal");
  doc.text("Adian. + Desconto (R$):", col2X, fy);
  doc.setFont("helvetica", "bold");
  doc.text(`R$ ${data.totals.adianMaisDesconto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, col2X + 45, fy);

  fy += 7;
  doc.setLineWidth(0.3);
  doc.line(10, fy - 1, pageWidth - 10, fy - 1);

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL DESPESAS (R$):", col1X, fy + 3);
  doc.text(`R$ ${data.totals.totalDespesas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, col1X + 45, fy + 3);

  doc.text("SALDO A PAGAR (R$):", col2X, fy + 3);
  doc.setTextColor(200, 0, 0);
  doc.text(`R$ ${data.totals.saldoAPagar.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, col2X + 45, fy + 3);
  doc.setTextColor(0, 0, 0);

  y += 40;

  // --- ASSINATURA DO HÓSPEDE ---
  if (y > 270) {
    doc.addPage();
    y = 30;
  } else {
    y += 10;
  }

  doc.setLineWidth(0.4);
  doc.line(pageWidth / 2 - 40, y, pageWidth / 2 + 40, y);
  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.text("Assinatura do Hóspede", pageWidth / 2, y + 4, { align: "center" });

  return doc.output("datauristring");
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF CONFIRMAÇÃO DE RESERVA
// ─────────────────────────────────────────────────────────────────────────────

export interface PdfReservaPayment {
  paymentDate: string;
  amount: number;
  paymentMethod: string;
}

export interface PdfReservaDiariaRow {
  dtReserva: string;  // "19/08/2026"
  dtFinal: string;    // "20/08/2026"
  diaria: number;     // 280.00
}

export interface PdfReservaData {
  hotelName: string;
  hotelCnpj?: string;
  hotelAddress?: string;
  reservationNumber: string;
  issueDate: string;           // "DD/MM/YYYY HH:MM"
  roomNumber: string;
  roomDescription?: string;
  roomCategory?: string;
  roomFloor?: string;
  guestName: string;
  guestCpf?: string;
  guestPhone?: string;
  checkInDate: string;         // "DD/MM/YYYY HH:MM"
  checkOutDate: string;        // "DD/MM/YYYY HH:MM"
  tariffName: string;
  adults?: number;
  children?: number;
  dailyRows: PdfReservaDiariaRow[];
  payments: PdfReservaPayment[];
  totals: {
    totalDiarias: number;
    totalAdiantamento: number;
    desconto: number;
    totalLiquido: number;
  };
  notes?: string;
}

/**
 * Generates a PDF for Confirmação de Reserva following the WinDev layout.
 * Returns as a Data URL (base64 string).
 */
export function generateReservaPdfBase64(data: PdfReservaData): string {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginL = 10;
  const marginR = pageWidth - 10;
  let y = 12;

  // ── HEADER HOTEL ──────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text((data.hotelName || "HOTEL IDEAL").toUpperCase(), pageWidth / 2, y, { align: "center" });

  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  const cnpjStr = data.hotelCnpj ? `CNPJ: ${data.hotelCnpj}` : "CNPJ: 40.904.811/0001-31";
  const addrStr = data.hotelAddress || "RUA MARECHAL RONDON, SN - ALTO PARANA - REDENCAO - PA CEP: 68550303 - (063) 3415-4614";
  doc.text(`${addrStr} - ${cnpjStr}`, pageWidth / 2, y, { align: "center" });

  y += 4;
  doc.setLineWidth(0.5);
  doc.line(marginL, y, marginR, y);

  // ── TÍTULO ────────────────────────────────────────────────────────────────
  y += 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("CONFIRMAÇÃO DE RESERVA", pageWidth / 2, y, { align: "center" });

  // ── NÚMERO E DATA DE EMISSÃO ──────────────────────────────────────────────
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(`Reserva N°: ${data.reservationNumber}`, marginL + 2, y);
  doc.text(`Emissão: ${data.issueDate}`, marginR - 2, y, { align: "right" });

  // ── BOX 1 — DADOS DO QUARTO ───────────────────────────────────────────────
  y += 5;
  const box1H = 20;
  doc.rect(marginL, y, pageWidth - 20, box1H);

  let bY = y + 5;
  doc.setFont("helvetica", "bold");
  doc.text("Quarto:", marginL + 2, bY);
  doc.setFont("helvetica", "normal");
  doc.text(data.roomNumber || "-", marginL + 20, bY);

  doc.setFont("helvetica", "bold");
  doc.text("Descrição:", marginL + 45, bY);
  doc.setFont("helvetica", "normal");
  doc.text(data.roomDescription || "-", marginL + 70, bY);

  doc.setFont("helvetica", "bold");
  doc.text("Local/Andar:", marginL + 130, bY);
  doc.setFont("helvetica", "normal");
  doc.text(data.roomFloor || "TERREO", marginL + 158, bY);

  bY += 7;
  doc.setFont("helvetica", "bold");
  doc.text("Categoria:", marginL + 2, bY);
  doc.setFont("helvetica", "normal");
  doc.text(data.roomCategory || "STANDAR", marginL + 26, bY);

  doc.setFont("helvetica", "bold");
  doc.text("Tarifa:", marginL + 75, bY);
  doc.setFont("helvetica", "normal");
  doc.text(data.tariffName || "-", marginL + 93, bY);

  doc.setFont("helvetica", "bold");
  doc.text("Adultos:", marginL + 145, bY);
  doc.setFont("helvetica", "normal");
  doc.text(`${data.adults || 1}`, marginL + 163, bY);

  doc.setFont("helvetica", "bold");
  doc.text("Crianças:", marginL + 170, bY);
  doc.setFont("helvetica", "normal");
  doc.text(`${data.children || 0}`, marginL + 190, bY);

  y += box1H + 3;

  // ── BOX 2 — DADOS DO HÓSPEDE ─────────────────────────────────────────────
  const box2H = 14;
  doc.rect(marginL, y, pageWidth - 20, box2H);

  bY = y + 5;
  doc.setFont("helvetica", "bold");
  doc.text("Hóspede:", marginL + 2, bY);
  doc.setFont("helvetica", "normal");
  doc.text((data.guestName || "-").toUpperCase(), marginL + 24, bY);

  doc.setFont("helvetica", "bold");
  doc.text("CPF:", marginL + 120, bY);
  doc.setFont("helvetica", "normal");
  doc.text(data.guestCpf || "-", marginL + 130, bY);

  bY += 6;
  doc.setFont("helvetica", "bold");
  doc.text("Dt. Chegada:", marginL + 2, bY);
  doc.setFont("helvetica", "normal");
  doc.text(data.checkInDate || "-", marginL + 28, bY);

  doc.setFont("helvetica", "bold");
  doc.text("Dt. Saída:", marginL + 75, bY);
  doc.setFont("helvetica", "normal");
  doc.text(data.checkOutDate || "-", marginL + 95, bY);

  doc.setFont("helvetica", "bold");
  doc.text("Telefone:", marginL + 140, bY);
  doc.setFont("helvetica", "normal");
  doc.text(data.guestPhone || "-", marginL + 160, bY);

  y += box2H + 4;

  // ── TABELA DE DIÁRIAS ─────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("DIÁRIAS DA RESERVA", marginL, y);

  y += 3;
  doc.setFillColor(220, 220, 220);
  doc.rect(marginL, y, pageWidth - 20, 6, "F");
  doc.rect(marginL, y, pageWidth - 20, 6, "S");

  doc.setFontSize(8);
  const col1 = marginL + 2;
  const col2 = marginL + 65;
  const col3 = marginL + 115;
  const col4 = marginR - 2;

  doc.text("Dt. Reserva", col1, y + 4);
  doc.text("Dt. Final", col2, y + 4);
  doc.text("Diária (R$)", col4, y + 4, { align: "right" });

  y += 6;
  doc.setFont("helvetica", "normal");

  const rows = data.dailyRows && data.dailyRows.length > 0
    ? data.dailyRows
    : [{ dtReserva: data.checkInDate.split(" ")[0], dtFinal: data.checkOutDate.split(" ")[0], diaria: data.totals.totalDiarias }];

  for (const row of rows) {
    if (y > 240) { doc.addPage(); y = 15; }
    doc.text(row.dtReserva, col1, y + 4);
    doc.text(row.dtFinal, col2, y + 4);
    doc.text(`R$ ${row.diaria.toFixed(2).replace(".", ",")}`, col4, y + 4, { align: "right" });
    y += 5;
    doc.setLineWidth(0.1);
    doc.line(marginL, y, marginR, y);
  }

  doc.setFont("helvetica", "bold");
  doc.text(
    `Valor TOTAL diárias (R$): R$ ${data.totals.totalDiarias.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    col4,
    y + 5,
    { align: "right" }
  );
  y += 10;

  // ── TABELA DE PAGAMENTOS/ADIANTAMENTOS ───────────────────────────────────
  if (data.payments && data.payments.length > 0) {
    if (y > 220) { doc.addPage(); y = 15; }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("PAGAMENTOS / ADIANTAMENTOS", marginL, y);

    y += 3;
    doc.setFillColor(220, 220, 220);
    doc.rect(marginL, y, pageWidth - 20, 6, "F");
    doc.rect(marginL, y, pageWidth - 20, 6, "S");

    doc.setFontSize(8);
    doc.text("Data/Hora", marginL + 2, y + 4);
    doc.text("Forma de Pagamento", marginL + 55, y + 4);
    doc.text("Valor Adiant. (R$)", col4, y + 4, { align: "right" });

    y += 6;
    doc.setFont("helvetica", "normal");
    for (const pmt of data.payments) {
      if (y > 255) { doc.addPage(); y = 15; }
      doc.text(pmt.paymentDate, marginL + 2, y + 4);
      doc.text(pmt.paymentMethod, marginL + 55, y + 4);
      doc.text(`R$ ${pmt.amount.toFixed(2).replace(".", ",")}`, col4, y + 4, { align: "right" });
      y += 5;
      doc.setLineWidth(0.1);
      doc.line(marginL, y, marginR, y);
    }
    y += 3;
  }

  // ── BOX TOTAIS ────────────────────────────────────────────────────────────
  if (y > 220) { doc.addPage(); y = 15; }

  const totBoxH = 32;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("RESUMO FINANCEIRO", marginL, y);
  y += 3;
  doc.rect(marginL, y, pageWidth - 20, totBoxH);

  const tCol1 = marginL + 8;
  const tCol2 = marginL + 55;
  const tCol3 = marginL + 112;
  const tCol4 = marginL + 160;

  let tY = y + 6;
  doc.setFontSize(8);

  doc.setFont("helvetica", "normal");
  doc.text("Valor TOTAL diárias (R$):", tCol1, tY);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 200);
  doc.text(`R$ ${data.totals.totalDiarias.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, tCol2, tY);
  doc.setTextColor(0, 0, 0);

  doc.setFont("helvetica", "normal");
  doc.text("Total Adiant. (R$):", tCol3, tY);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 130, 0);
  doc.text(`R$ ${data.totals.totalAdiantamento.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, tCol4, tY);
  doc.setTextColor(0, 0, 0);

  tY += 7;
  doc.setFont("helvetica", "normal");
  doc.text("Desconto (R$):", tCol1, tY);
  doc.setFont("helvetica", "bold");
  doc.text(`R$ ${data.totals.desconto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, tCol2, tY);

  tY += 2;
  doc.setLineWidth(0.3);
  doc.line(marginL, tY + 3, marginR, tY + 3);

  tY += 7;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL LÍQUIDO (R$):", tCol1, tY);
  doc.setTextColor(200, 0, 0);
  doc.text(`R$ ${data.totals.totalLiquido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, tCol2 + 10, tY);
  doc.setTextColor(0, 0, 0);

  y += totBoxH + 10;

  // ── ASSINATURA ────────────────────────────────────────────────────────────
  if (y > 270) { doc.addPage(); y = 25; }
  doc.setLineWidth(0.4);
  doc.line(pageWidth / 2 - 40, y, pageWidth / 2 + 40, y);
  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.text("Assinatura do Hóspede", pageWidth / 2, y + 4, { align: "center" });

  // ── RODAPÉ ────────────────────────────────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(130, 130, 130);
  doc.text(`Documento emitido em ${data.issueDate} — ${data.hotelName}`, pageWidth / 2, pageH - 8, { align: "center" });
  doc.setTextColor(0, 0, 0);

  return doc.output("datauristring");
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF RECIBO DE PAGAMENTO / ADIANTAMENTO DE HOSPEDAGEM
// ─────────────────────────────────────────────────────────────────────────────

const MESES_PT = [
  "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
  "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
];

export interface PdfReciboPaymentRow {
  date: string;              // "15/08/2026 11:52"
  amount: number;
  methodDescription: string;
  operatorName?: string;
}

export interface PdfReciboData {
  hotelName: string;
  hotelCnpj?: string;
  hotelAddress?: string;
  guestName: string;
  roomNumber?: string;
  payments: PdfReciboPaymentRow[];
  operatorName?: string;
  cityUf?: string; // ex: "REDENCAO-PA"
}

/**
 * Gera o PDF do Recibo de Pagamento/Adiantamento de Hospedagem, seguindo o
 * modelo oficial usado pelo sistema (Recibo de pagamento hospedagem.pdf).
 * Aceita um ou mais lançamentos de pagamento — quando há mais de um, emite
 * um único recibo consolidado com o detalhamento de cada lançamento.
 */
export function generateReciboPdfBase64(data: PdfReciboData): string {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginL = 15;
  const marginR = pageWidth - 15;
  let y = 18;

  const totalValor = data.payments.reduce((acc, p) => acc + (p.amount || 0), 0);

  // ── CABEÇALHO DO HOTEL ────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text((data.hotelName || "HOTEL IDEAL").toUpperCase(), marginL, y);

  doc.setFontSize(10);
  const cnpjStr = `CNPJ: ${data.hotelCnpj || "40.904.811/0001-31"}`;
  doc.text(cnpjStr, marginR, y, { align: "right" });

  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const addrStr = data.hotelAddress || "RUA MARECHAL RONDON BAIRRO: ALTO PARANA NUMERO: SN CIDADE: REDENCAO/PA";
  const addrLines = doc.splitTextToSize(addrStr, marginR - marginL);
  doc.text(addrLines, marginL, y);
  y += addrLines.length * 4 + 6;

  // ── TÍTULO ────────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("R E C I B O", pageWidth / 2, y, { align: "center" });

  y += 9;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Valor:", marginR - 35, y);
  doc.setFont("helvetica", "normal");
  doc.text(`R$ ${totalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, marginR, y, { align: "right" });

  // ── RECEBEMOS DE / IMPORTÂNCIA ────────────────────────────────────────────
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Recebemos de", marginL, y);
  doc.setFont("helvetica", "normal");
  doc.text((data.guestName || "-").toUpperCase(), marginL + 32, y);

  y += 7;
  doc.setFont("helvetica", "bold");
  doc.text("A importância de", marginL, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(valorPorExtenso(totalValor), marginL + 32, y);

  y += 9;
  doc.setFontSize(9);
  if (data.payments.length === 1) {
    const p = data.payments[0];
    doc.setFont("helvetica", "bold");
    doc.text("Forma de pagamento:", marginL, y);
    doc.setFont("helvetica", "normal");
    doc.text((p.methodDescription || "-").toUpperCase(), marginL + 38, y);

    doc.setFont("helvetica", "bold");
    doc.text("Data Pagto:", marginL + 110, y);
    doc.setFont("helvetica", "normal");
    doc.text(p.date.split(" ")[0] || "-", marginL + 133, y);
    y += 10;
  } else {
    doc.setFont("helvetica", "bold");
    doc.text("Forma de pagamento: DIVERSAS (detalhamento abaixo)", marginL, y);
    y += 6;

    doc.setFillColor(235, 235, 235);
    doc.rect(marginL, y, marginR - marginL, 6, "F");
    doc.rect(marginL, y, marginR - marginL, 6, "S");
    doc.setFontSize(8);
    doc.text("Data/Hora", marginL + 2, y + 4);
    doc.text("Forma de Pagamento", marginL + 45, y + 4);
    doc.text("Operador", marginL + 100, y + 4);
    doc.text("Valor (R$)", marginR - 2, y + 4, { align: "right" });

    y += 6;
    doc.setFont("helvetica", "normal");
    for (const p of data.payments) {
      if (y > 260) {
        doc.addPage();
        y = 15;
      }
      doc.text(p.date, marginL + 2, y + 4);
      doc.text((p.methodDescription || "-").toUpperCase(), marginL + 45, y + 4);
      doc.text((p.operatorName || "-").toUpperCase(), marginL + 100, y + 4);
      doc.text(`R$ ${p.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, marginR - 2, y + 4, { align: "right" });
      y += 5;
      doc.setLineWidth(0.1);
      doc.line(marginL, y, marginR, y);
    }

    y += 3;
    doc.setFont("helvetica", "bold");
    doc.text(`Total: R$ ${totalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, marginR, y, { align: "right" });
    y += 10;
  }

  // ── DATA/LOCAL DE EMISSÃO ────────────────────────────────────────────────
  const now = new Date();
  const dataExtenso = `${data.cityUf || "REDENCAO-PA"}, ${now.getDate()} DE ${MESES_PT[now.getMonth()]} DE ${now.getFullYear()}`;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Para maior clareza firmo o presente.", pageWidth / 2, y, { align: "center" });
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.text(dataExtenso, pageWidth / 2, y, { align: "center" });

  // ── ASSINATURA ────────────────────────────────────────────────────────────
  y += 18;
  doc.setFont("helvetica", "bold");
  doc.text("Assinatura:", marginL, y);
  doc.setLineWidth(0.3);
  doc.line(marginL + 22, y, marginR, y);

  y += 8;
  doc.setFont("helvetica", "bold");
  doc.text("Op:", marginL, y);
  doc.setFont("helvetica", "normal");
  doc.text((data.operatorName || "-").toUpperCase(), marginL + 8, y);

  return doc.output("datauristring");
}
