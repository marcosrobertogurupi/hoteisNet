// Cliente de integração com a API do SNRHos (FNRH Digital, Ministério do Turismo/Serpro),
// construído a partir do manual técnico oficial "Documentação da API FNRH - Versão 2 (v2)".
// Ainda não testado contra o ambiente de homologação real (aguardando credenciais) — o formato
// dos endpoints/payload segue o manual à risca, mas qualquer chamada real deve ser validada
// assim que houver acesso a um usuário/chave de homologação.
import { prisma } from "@/lib/prisma";

const PRODUCAO_BASE_URL = "https://fnrh.turismo.serpro.gov.br/FNRH_API/rest/v2";
const HOMOLOGACAO_BASE_URL = "https://hom-lowcode.serpro.gov.br/FNRH_API/rest/v2";
const SNRHOS_TIMEOUT_MS = 15000;

export class SnrhosUnreachableError extends Error {
  constructor(message = "Não foi possível conectar à API do SNRHos. O serviço pode estar instável ou fora do ar.") {
    super(message);
    this.name = "SnrhosUnreachableError";
  }
}

export class SnrhosApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`SNRHos respondeu ${status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
    this.name = "SnrhosApiError";
    this.status = status;
    this.body = body;
  }
}

export interface SnrhosCredentials {
  environment: string; // "HOMOLOGACAO" | "PRODUCAO"
  apiUsername: string;
  apiPassword: string;
  cpfSolicitante: string;
}

function resolveBaseUrl(environment: string): string {
  return environment === "PRODUCAO" ? PRODUCAO_BASE_URL : HOMOLOGACAO_BASE_URL;
}

async function fetchSnrhos(creds: SnrhosCredentials, path: string, init: RequestInit = {}): Promise<any> {
  const basicAuth = Buffer.from(`${creds.apiUsername}:${creds.apiPassword}`).toString("base64");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SNRHOS_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${resolveBaseUrl(creds.environment)}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Basic ${basicAuth}`,
        cpf_solicitante: creds.cpfSolicitante.replace(/\D/g, ""),
        ...(init.headers || {}),
      },
    });
  } catch {
    throw new SnrhosUnreachableError();
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    throw new SnrhosApiError(response.status, json);
  }
  return json;
}

// PaisNacionalidade_id/PaisResidencia_id exigem ISO 3166-1 alpha-2. Guest.nationality já é
// armazenado nesse formato (select na tela de pré-check-in); Guest.country é texto livre em
// português (ex: "Brasil") por ser também usado no cadastro comercial normal do hóspede, então
// aqui fazemos um mapeamento mínimo — na prática quase sempre "BR", já que a maioria dos
// hóspedes reside no Brasil.
function mapCountryNameToIso2(countryName: string | null | undefined): string {
  const normalized = (countryName || "").trim().toLowerCase();
  if (!normalized || normalized === "brasil" || normalized === "brazil") return "BR";
  return "BR"; // fallback conservador — ver observação acima sobre país de residência estrangeiro
}

function mapGenderToSnrhos(gender: string | null | undefined): string {
  if (gender === "Masculino") return "HOMEM";
  if (gender === "Feminino") return "MULHER";
  return "NAOINFORMADO";
}

// Resolve o cidade_id (código IBGE de 7 dígitos) exigido pela API a partir do nome de cidade em
// texto livre digitado pelo hóspede (Guest.city) + UF, usando a tabela Municipality importada da
// FNRH/IBGE (ver packages/database/scripts/import-municipalities.js). Busca exata
// case-insensitive por nome+UF primeiro; sem UF ou sem correspondência exata, tenta só pelo nome
// (retornando o primeiro resultado, com o risco de homônimos entre estados). Retorna 0 quando não
// encontra — a API deve rejeitar ou ignorar esse valor, o que é preferível a inventar um código.
export async function resolveCidadeIdIbge(cityName: string | null | undefined, uf: string | null | undefined): Promise<number> {
  const name = (cityName || "").trim();
  if (!name) return 0;

  const match =
    (uf && (await prisma.municipality.findFirst({ where: { name: { equals: name, mode: "insensitive" }, uf: uf.toUpperCase() } }))) ||
    (await prisma.municipality.findFirst({ where: { name: { equals: name, mode: "insensitive" } } }));

  return match ? Number(match.ibgeCode) : 0;
}

interface RegistrarHospedagemInput {
  reservationNumber: string;
  checkInDate: Date;
  checkOutDate: Date;
  adults: number;
  children: number;
  guest: {
    fullName: string;
    cpf: string | null;
    passport: string | null;
    birthDate: Date | null;
    gender: string | null;
    nationality: string | null;
    raceColor: string | null;
    disability: string | null;
    disabilityType: string | null;
    email: string | null;
    phone: string | null;
    country: string | null;
    zipCode: string | null;
    street: string | null;
    number: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
  };
  fnrh: {
    travelReason: string;
    transportMode: string;
  };
}

// Monta o payload de POST /hospedagem/registrar a partir dos dados já coletados no pré-check-in
// (Guest + FNRHRecord + Reservation). situacao_hospede fica "PRECHECKIN_REALIZADO" porque esta
// função só é chamada depois que o hóspede concluiu o preenchimento — o check-in físico ainda não
// aconteceu (check_in_em/check_out_em ficam vazios).
//
// cidade_id é resolvido via resolveCidadeIdIbge (tabela Municipality) — fica 0 se o nome da
// cidade digitado pelo hóspede não bater com nenhum município conhecido.
export async function buildHospedagemRegistrarPayload(input: RegistrarHospedagemInput) {
  const { guest, fnrh } = input;
  const documentoTipo = guest.cpf ? "CPF" : guest.passport ? "PASSAPORTE" : null;
  const documentoNumero = guest.cpf ? guest.cpf.replace(/\D/g, "") : guest.passport;
  const cidadeId = await resolveCidadeIdIbge(guest.city, guest.state);

  return {
    reserva: {
      numero_reserva: input.reservationNumber,
      numero_reserva_ota: "",
      data_entrada: input.checkInDate.toISOString().slice(0, 10),
      data_saida: input.checkOutDate.toISOString().slice(0, 10),
      quantidade_hospede_adulto: input.adults || 1,
      quantidade_hospede_menor: input.children || 0,
      origem_reserva_id: "MEIOHOSPEDAGEM",
    },
    dados_hospede: [
      {
        is_principal: true,
        situacao_hospede: "PRECHECKIN_REALIZADO",
        check_in_em: "",
        check_out_em: "",
        dados_pessoais: {
          nome: guest.fullName,
          nome_social: "",
          PaisNacionalidade_id: guest.nationality || "BR",
          genero_id: mapGenderToSnrhos(guest.gender),
          GeneroDescricao: "",
          data_nascimento: guest.birthDate ? guest.birthDate.toISOString().slice(0, 10) : "",
          raca_id: guest.raceColor || "NAOINFORMAR",
          deficiencia_id: guest.disability || "NAOINFORMAR",
          tipo_deficiencia_id: guest.disability === "SIM" ? guest.disabilityType || "" : "",
          documento_id: {
            numero_documento: documentoNumero || "",
            tipo_documento_id: documentoTipo || "CPF",
          },
          contato: {
            email: guest.email || "",
            telefone: (guest.phone || "").replace(/\D/g, ""),
            cep: (guest.zipCode || "").replace(/\D/g, ""),
            logradouro: guest.street || "",
            numero: guest.number || "",
            complemento: "",
            bairro: guest.neighborhood || "",
            PaisResidencia_id: mapCountryNameToIso2(guest.country),
            cidade_id: cidadeId,
            estado_id: guest.state || "",
          },
        },
        responsavel: { numero_documento: "", tipo_documento_id: "" },
        dados_ficha: {
          motivo_viagem_id: fnrh.travelReason,
          meio_transporte_id: fnrh.transportMode,
        },
      },
    ],
  };
}

export interface RegistrarHospedagemResult {
  reservaId: string;
  hospedeId: string;
  pessoaId: string;
  linkPrecheckin: string | null;
}

export async function registrarHospedagem(
  creds: SnrhosCredentials,
  payload: Awaited<ReturnType<typeof buildHospedagemRegistrarPayload>>
): Promise<RegistrarHospedagemResult> {
  const json = await fetchSnrhos(creds, "/hospedagem/registrar", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const reserva = json?.dados?.reserva;
  const hospede = json?.dados?.dados_hospedes?.[0];

  return {
    reservaId: reserva?.reserva_id || "",
    hospedeId: hospede?.hospede_id || "",
    pessoaId: hospede?.hospede?.pessoa_id || "",
    linkPrecheckin: reserva?.link_precheckin || null,
  };
}

// Traduz o erro técnico bruto de uma tentativa de transmissão (JSON de API, código HTTP...) para
// uma frase que faça sentido pra quem está gerenciando a tela de Controle de FNRH — usado tanto ao
// gravar um erro novo (transmitFnrhRecord) quanto ao exibir erros antigos já salvos em
// snrhosLastError por execuções anteriores do pipeline automático (apps/worker/src/snrhosTransmit.ts).
export function friendlyFnrhFailureReason(rawError: string | null | undefined): string | null {
  if (!rawError) return null;
  if (/401|senha inv|usu[aá]rio ou senha/i.test(rawError)) {
    return "Usuário ou senha do SNRHos incorretos — atualize as credenciais em Configurações.";
  }
  if (/hóspede sem cpf/i.test(rawError)) {
    return "Hóspede sem CPF nem passaporte cadastrado.";
  }
  if (/inalcançável|timeout|rede indispon/i.test(rawError)) {
    return "Não foi possível conectar ao SNRHos. Tente novamente em alguns minutos.";
  }
  return "O SNRHos recusou o envio desta ficha. Confira os dados do hóspede e tente novamente.";
}

// Prazo legal de transmissão da FNRH (Portaria MTur nº 177/2011, reafirmado pela FNRH Digital —
// Portaria MTur nº 41/2025): cada ficha deve ser enviada em tempo real ou, no limite, até o 3º dia
// útil (quarta-feira) da semana seguinte à semana em que ocorreu a hospedagem (check-in de
// segunda a domingo de uma semana -> prazo até a quarta-feira da semana seguinte). Ancorado no
// fuso de Brasília, independente do fuso do processo Node (mesma técnica de dateOnlyBrasilia em
// src/lib/brasiliaDate.ts). deadlineExclusive é o instante em que o prazo efetivamente vence (início
// da quinta-feira) — comparar "agora < deadlineExclusive" para saber se ainda está no prazo.
export function computeFnrhLegalDeadline(checkInDate: Date): { deadline: Date; deadlineExclusive: Date } {
  const brDateStr = checkInDate.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [y, m, d] = brDateStr.split("-").map(Number);
  const anchored = new Date(Date.UTC(y, m - 1, d, 3, 0, 0)); // meia-noite BRT do dia do check-in
  const dow = anchored.getUTCDay(); // 0=domingo..6=sábado
  const diffToMonday = dow === 0 ? 6 : dow - 1;
  const weekMonday = new Date(anchored);
  weekMonday.setUTCDate(weekMonday.getUTCDate() - diffToMonday);
  const deadline = new Date(weekMonday);
  deadline.setUTCDate(deadline.getUTCDate() + 9); // +7 dias (semana seguinte) + 2 dias (segunda -> quarta)
  const deadlineExclusive = new Date(deadline);
  deadlineExclusive.setUTCDate(deadlineExclusive.getUTCDate() + 1); // vence a partir do início da quinta-feira
  return { deadline, deadlineExclusive };
}

// Dispara manualmente a transmissão de UMA ficha FNRH pendente ao SNRHos — usado pela tela
// Tarefas administrativas > Controle de FNRH (envio individual e, em sequência no cliente, envio
// em lote por período). tenantId sempre vem da sessão autenticada de quem chama (nunca do body),
// e é revalidado contra o dono da reserva antes de transmitir qualquer coisa.
export async function transmitFnrhRecord(tenantId: string, fnrhRecordId: string): Promise<{ success: boolean; error?: string }> {
  const settings = await prisma.sNRHosSetting.findUnique({ where: { tenantId } });
  if (!settings || !settings.enabled) {
    return { success: false, error: "A transmissão ao SNRHos não está habilitada em Configurações." };
  }

  const record = await prisma.fNRHRecord.findFirst({
    where: { id: fnrhRecordId, reservation: { room: { tenantId } } },
    include: { guest: true, reservation: true },
  });
  if (!record || !record.reservation) {
    return { success: false, error: "Ficha não encontrada." };
  }
  if (record.transmittedSNRHos) {
    return { success: true };
  }

  const guest = record.guest;
  if (!guest.cpf && !guest.passport) {
    const error = "Hóspede sem CPF nem passaporte cadastrado.";
    await prisma.fNRHRecord.update({ where: { id: record.id }, data: { snrhosAttempts: { increment: 1 }, snrhosLastError: error } });
    return { success: false, error };
  }

  try {
    const payload = await buildHospedagemRegistrarPayload({
      reservationNumber: record.reservation.reservationNumber || record.reservation.id,
      checkInDate: record.reservation.checkInDate,
      checkOutDate: record.reservation.checkOutDate,
      adults: record.reservation.adults || 1,
      children: record.reservation.children || 0,
      guest: {
        fullName: guest.fullName,
        cpf: guest.cpf,
        passport: guest.passport,
        birthDate: guest.birthDate,
        gender: guest.gender,
        nationality: guest.nationality,
        raceColor: guest.raceColor,
        disability: guest.disability,
        disabilityType: guest.disabilityType,
        email: guest.email,
        phone: guest.phone,
        country: guest.country,
        zipCode: guest.zipCode,
        street: guest.street,
        number: guest.number,
        neighborhood: guest.neighborhood,
        city: guest.city,
        state: guest.state,
      },
      fnrh: { travelReason: record.travelReason, transportMode: record.transportMode },
    });

    const result = await registrarHospedagem(
      { environment: settings.environment, apiUsername: settings.apiUsername, apiPassword: settings.apiPassword, cpfSolicitante: settings.cpfSolicitante },
      payload
    );

    await prisma.fNRHRecord.update({
      where: { id: record.id },
      data: {
        transmittedSNRHos: true,
        transmittedAt: new Date(),
        snrhosReservaId: result.reservaId || null,
        snrhosHospedeId: result.hospedeId || null,
        snrhosPessoaId: result.pessoaId || null,
        snrhosLastError: null,
      },
    });
    return { success: true };
  } catch (err: any) {
    const friendly = friendlyFnrhFailureReason(err?.message || String(err)) || "Falha inesperada ao transmitir a ficha.";
    await prisma.fNRHRecord.update({
      where: { id: record.id },
      data: { snrhosAttempts: { increment: 1 }, snrhosLastError: friendly },
    });
    return { success: false, error: friendly };
  }
}
