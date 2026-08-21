import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Construído a partir do manual técnico oficial da API FNRH v2 (Ministério do Turismo/Serpro).
// Ainda não testado contra o ambiente de homologação real — aguardando credenciais. Enquanto
// nenhum tenant tiver SNRHosSetting.enabled=true, este job não encontra nada a fazer (no-op seguro).
const PRODUCAO_BASE_URL = "https://fnrh.turismo.serpro.gov.br/FNRH_API/rest/v2";
const HOMOLOGACAO_BASE_URL = "https://hom-lowcode.serpro.gov.br/FNRH_API/rest/v2";
const SNRHOS_TIMEOUT_MS = 15000;
// Depois desse número de tentativas malsucedidas, o job para de tentar reenviar automaticamente
// (o registro fica com transmittedSNRHos=false e snrhosLastError preenchido, visível para
// investigação manual) — evita martelar a API do governo indefinidamente por um erro persistente
// (ex: CEP/documento inválido) que não vai se resolver sozinho.
const MAX_ATTEMPTS = 5;

function resolveBaseUrl(environment: string): string {
  return environment === "PRODUCAO" ? PRODUCAO_BASE_URL : HOMOLOGACAO_BASE_URL;
}

function mapGenderToSnrhos(gender: string | null): string {
  if (gender === "Masculino") return "HOMEM";
  if (gender === "Feminino") return "MULHER";
  return "NAOINFORMADO";
}

function mapCountryNameToIso2(countryName: string | null): string {
  const normalized = (countryName || "").trim().toLowerCase();
  if (!normalized || normalized === "brasil" || normalized === "brazil") return "BR";
  return "BR";
}

// Resolve cidade_id (código IBGE) via a tabela Municipality importada da FNRH/IBGE (ver
// packages/database/scripts/import-municipalities.js). Mesmo comportamento do resolver em
// apps/web/src/lib/snrhosClient.ts — duplicado aqui porque o worker é um processo separado que
// não importa código de apps/web (mesmo padrão de checkoutPrevision.ts/preCheckinFnrh.ts).
async function resolveCidadeIdIbge(cityName: string | null, uf: string | null): Promise<number> {
  const name = (cityName || "").trim();
  if (!name) return 0;

  const match =
    (uf && (await prisma.municipality.findFirst({ where: { name: { equals: name, mode: "insensitive" }, uf: uf.toUpperCase() } }))) ||
    (await prisma.municipality.findFirst({ where: { name: { equals: name, mode: "insensitive" } } }));

  return match ? Number(match.ibgeCode) : 0;
}

async function fetchSnrhos(creds: { environment: string; apiUsername: string; apiPassword: string; cpfSolicitante: string }, path: string, init: RequestInit) {
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
      },
    });
  } catch {
    throw new Error("SNRHos inalcançável (timeout ou rede indisponível)");
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
    throw new Error(`SNRHos respondeu ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

/**
 * Roda a cada 5 minutos (agendado em index.ts). Para cada tenant com transmissão ao SNRHos
 * habilitada (SNRHosSetting.enabled=true), busca FNRHRecord ainda não transmitidos
 * (transmittedSNRHos=false) do mesmo tenant e chama POST /hospedagem/registrar, registrando o
 * resultado (IDs devolvidos ou erro) em cada FNRHRecord.
 */
export async function runSnrhosTransmit(): Promise<void> {
  const enabledSettings = await prisma.sNRHosSetting.findMany({ where: { enabled: true } });
  if (enabledSettings.length === 0) return;

  for (const settings of enabledSettings) {
    const pending = await prisma.fNRHRecord.findMany({
      where: {
        transmittedSNRHos: false,
        snrhosAttempts: { lt: MAX_ATTEMPTS },
        reservation: { room: { tenantId: settings.tenantId } },
      },
      include: { guest: true, reservation: true },
    });

    for (const record of pending) {
      if (!record.reservation) continue;
      const guest = record.guest;
      const documentoTipo = guest.cpf ? "CPF" : guest.passport ? "PASSAPORTE" : null;
      if (!documentoTipo) {
        await prisma.fNRHRecord.update({
          where: { id: record.id },
          data: { snrhosAttempts: { increment: 1 }, snrhosLastError: "Hóspede sem CPF nem passaporte cadastrado." },
        });
        continue;
      }

      const cidadeId = await resolveCidadeIdIbge(guest.city, guest.state);

      const payload = {
        reserva: {
          numero_reserva: record.reservation.reservationNumber || record.reservation.id,
          numero_reserva_ota: "",
          data_entrada: record.reservation.checkInDate.toISOString().slice(0, 10),
          data_saida: record.reservation.checkOutDate.toISOString().slice(0, 10),
          quantidade_hospede_adulto: record.reservation.adults || 1,
          quantidade_hospede_menor: record.reservation.children || 0,
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
                numero_documento: (documentoTipo === "CPF" ? guest.cpf : guest.passport) || "",
                tipo_documento_id: documentoTipo,
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
              motivo_viagem_id: record.travelReason,
              meio_transporte_id: record.transportMode,
            },
          },
        ],
      };

      try {
        const json = await fetchSnrhos(settings, "/hospedagem/registrar", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        const reserva = json?.dados?.reserva;
        const hospede = json?.dados?.dados_hospedes?.[0];

        await prisma.fNRHRecord.update({
          where: { id: record.id },
          data: {
            transmittedSNRHos: true,
            transmittedAt: new Date(),
            snrhosReservaId: reserva?.reserva_id || null,
            snrhosHospedeId: hospede?.hospede_id || null,
            snrhosPessoaId: hospede?.hospede?.pessoa_id || null,
            snrhosLastError: null,
          },
        });
        console.log(`[snrhos-transmit] transmitido — tenant=${settings.tenantId} fnrhRecord=${record.id}`);
      } catch (err: any) {
        await prisma.fNRHRecord.update({
          where: { id: record.id },
          data: { snrhosAttempts: { increment: 1 }, snrhosLastError: String(err?.message || err) },
        });
        console.error(`[snrhos-transmit] falha — tenant=${settings.tenantId} fnrhRecord=${record.id}:`, err?.message || err);
      }
    }
  }
}
