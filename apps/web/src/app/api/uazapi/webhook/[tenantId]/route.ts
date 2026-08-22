import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { brazilPhoneVariants } from "@/lib/uazapiInstance";
import { sendUazapiText, downloadUazapiMedia, fetchAsBase64 } from "@/lib/uazapi";
import { buildGuestSupportAgent } from "@/lib/aiAgent/agent";
import { hasAiQuotaAvailable, logAiUsage } from "@/lib/aiAgent/usage";

type AgentMessageContent = string | Array<{ type: "text"; text: string } | { type: "file"; mediaType: string; data: string }>;

// Só esses tipos de mídia o agente consegue de fato interpretar (Gemini aceita imagem, áudio e PDF
// como input multimodal). Vídeo/sticker/outros viram um placeholder de texto — o agente ainda
// consegue reagir ("recebi seu anexo, mas não consigo abrir esse tipo de arquivo") sem travar.
function isInterpretableMimetype(mimetype: string): boolean {
  return mimetype.startsWith("image/") || mimetype.startsWith("audio/") || mimetype === "application/pdf";
}

// Monta o conteúdo de uma mensagem IN de mídia para o agente — só para a mensagem mais recente do
// turno (mensagens antigas do histórico viram placeholder de texto, ver chamador). Baixa/
// descriptografa o anexo e envia os bytes como dado inline (base64), não como URL: passar a URL
// direto (fileData.fileUri) tecnicamente funciona, mas a API do Gemini bloqueia com 429
// (RESOURCE_EXHAUSTED) esse caminho no tier gratuito, mesmo com cota de texto disponível —
// confirmado testando os dois lado a lado. Devolve null se não for possível interpretar.
async function buildMediaContent(
  msg: { id: string; content: string | null; externalId: string | null },
  tenantId: string
): Promise<AgentMessageContent | null> {
  if (!msg.externalId) return null;

  const downloaded = await downloadUazapiMedia(msg.externalId, tenantId);
  if (!downloaded) return null;

  // Aproveita o download para já cachear mediaUrl/mimeType em WhatsappMessage — a tela de
  // conversa (MensagensWhatsAppModal) não precisa rebaixar o mesmo anexo quando o operador abrir.
  await prisma.whatsappMessage.update({
    where: { id: msg.id },
    data: { mediaUrl: downloaded.mediaUrl, mimeType: downloaded.mimetype },
  });

  if (!isInterpretableMimetype(downloaded.mimetype)) return null;

  const base64 = await fetchAsBase64(downloaded.mediaUrl);
  if (!base64) return null;

  const parts: AgentMessageContent = [{ type: "file", mediaType: downloaded.mimetype, data: base64 }];
  if (msg.content) parts.push({ type: "text", text: msg.content });
  return parts;
}

// Roda o agente de atendimento por IA para uma mensagem recebida, se o tenant tiver habilitado.
// Nunca deixa uma falha do agente derrubar o webhook — a mensagem do hóspede já foi salva antes
// desta função ser chamada, então o pior caso é só não haver resposta automática.
async function runGuestSupportAgent(tenantId: string, phone: string) {
  try {
    const setting = await prisma.aIAgentSetting.findUnique({ where: { tenantId } });
    if (!setting?.enabled) return;
    if (!(await hasAiQuotaAvailable(tenantId))) return;

    // Se um humano respondeu recentemente nesta conversa, deixa o atendimento com ele — o agente
    // não entra por cima de um atendente que já assumiu a conversa.
    const recentHumanReply = await prisma.whatsappMessage.findFirst({
      where: {
        tenantId,
        phone,
        direction: "OUT",
        sentBy: "HUMAN",
        createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
      },
    });
    if (recentHumanReply) return;

    // Inclui mídia recebida do hóspede (IN) além de texto — mídia enviada pelo próprio hotel (OUT,
    // ex: PDF de extrato) fica de fora do histórico, não é conversacional o suficiente para valer
    // reprocessar. O agente interpreta foto/áudio/PDF de verdade (ver buildMediaContent); outros
    // tipos de anexo viram um placeholder de texto para o agente não travar nem inventar conteúdo.
    const history = await prisma.whatsappMessage.findMany({
      where: { tenantId, phone, OR: [{ type: "text" }, { direction: "IN", type: "media" }] },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, direction: true, type: true, content: true, mediaUrl: true, mimeType: true, externalId: true },
    });
    const ordered = history.reverse();
    const latestId = ordered.length > 0 ? ordered[ordered.length - 1].id : null;

    const messages: Array<{ role: "user" | "assistant"; content: AgentMessageContent }> = [];
    for (const m of ordered) {
      const role = m.direction === "IN" ? ("user" as const) : ("assistant" as const);
      if (m.type === "text") {
        if (m.content) messages.push({ role, content: m.content });
        continue;
      }
      // Só a mensagem mais recente é baixada/interpretada de verdade — mídia antiga do histórico
      // vira placeholder de texto, para não reprocessar anexos a cada novo turno da conversa.
      const mediaContent = m.id === latestId ? await buildMediaContent(m, tenantId) : null;
      // Placeholder neutro: nunca soar como uma falha do turno atual. Mídia antiga (não é a última
      // mensagem) sempre cai aqui mesmo que pudesse ter sido interpretada na hora — é só contexto
      // de conversas passadas, não algo que precise de reação agora. Confirmado com um caso real:
      // o texto anterior ("não foi possível interpretar automaticamente") fez o agente achar que
      // havia um anexo travado no turno atual e escalar para humano sem necessidade.
      const placeholder =
        m.id === latestId
          ? "[O hóspede enviou um anexo que não foi possível interpretar automaticamente]"
          : "[Anexo enviado pelo hóspede em conversa anterior — sem relação com a mensagem atual]";
      messages.push({
        role,
        content: mediaContent || placeholder,
      });
    }
    if (messages.length === 0) return;

    let escalationReason: string | null = null;
    const agent = buildGuestSupportAgent(
      tenantId,
      phone,
      {
        agentDisplayName: setting.agentDisplayName,
        tonePreset: setting.tonePreset,
        adminSystemPromptExtra: setting.systemPromptExtra,
      },
      (reason) => {
        escalationReason = reason;
      }
    );
    const result = await agent.generate({ messages });

    if (escalationReason) {
      console.log(`[runGuestSupportAgent] escalado para humano — tenant=${tenantId} phone=${phone} motivo=${escalationReason}`);
      // Dedupe por telefone: se já existe uma escalação não resolvida desta conversa, não cria outra
      // a cada nova mensagem do hóspede enquanto ele espera — evita repicar o alerta sonoro à toa.
      const alreadyPending = await prisma.humanEscalation.findFirst({
        where: { tenantId, source: "SUPPORT_AGENT", guestPhone: phone, resolved: false },
      });
      if (!alreadyPending) {
        await prisma.humanEscalation.create({
          data: { tenantId, source: "SUPPORT_AGENT", reason: escalationReason, guestPhone: phone },
        });
      }
    }

    await logAiUsage({
      tenantId,
      feature: "whatsapp_guest_support",
      tokensInput: result.usage.inputTokens ?? 0,
      tokensOutput: result.usage.outputTokens ?? 0,
    });

    if (result.text?.trim()) {
      const sent = await sendUazapiText(phone, result.text.trim(), tenantId);
      if (sent) {
        await prisma.whatsappMessage.create({
          data: { tenantId, phone, direction: "OUT", type: "text", content: result.text.trim(), sentBy: "AI" },
        });
      }
    }
  } catch (error) {
    console.error("[runGuestSupportAgent] Erro:", error);
  }
}

// POST /api/uazapi/webhook/[tenantId] — recebe eventos da uazapi (configurados em Configurações >
// API Whatsapp > URL WebHook). Só processa mensagens recebidas do hóspede (fromMe=false); mensagens
// enviadas pelo próprio HoteisNet já ficam de fora pelo filtro excludeMessages=["wasSentByApi"]
// configurado no /webhook da uazapi, mas fromMe também é checado aqui por segurança.
export async function POST(req: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  try {
    const { tenantId } = await params;
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ success: true }); // uazapi só precisa de um 200

    // Formato real de entrega da uazapi: { EventType: "messages", message: {...}, chat: {...},
    // instanceName, owner, token }. A documentação OpenAPI descreve um envelope genérico
    // { event, instance, data } que NÃO é o que a uazapi de fato envia — por isso o payload real
    // (confirmado testando com webhook.site) precede qualquer suposição da doc.
    const data = body.message || body.data || body;
    const fromMe = !!data?.fromMe;
    const wasSentByApi = !!data?.wasSentByApi;
    if (fromMe || wasSentByApi) {
      return NextResponse.json({ success: true, ignored: "outbound" });
    }

    const chatId: string = data?.chatid || data?.sender_pn || data?.sender || "";
    const isGroup = !!data?.isGroup || chatId.includes("@g.us");
    if (!chatId || isGroup) {
      return NextResponse.json({ success: true, ignored: "no-chatid-or-group" });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) return NextResponse.json({ success: true, ignored: "tenant-not-found" });

    const phone = chatId.replace(/\D/g, "");
    const externalId: string | undefined = data?.messageid || undefined;

    // Idempotência: reentregas de webhook não devem duplicar a mesma mensagem.
    if (externalId) {
      const existing = await prisma.whatsappMessage.findFirst({ where: { tenantId, externalId } });
      if (existing) return NextResponse.json({ success: true, duplicate: true });
    }

    // Encontra a hospedagem em aberto do tenant cujo hóspede tem esse telefone. Compara por
    // interseção de variantes (com/sem o 9º dígito), não igualdade direta — o chatid que a uazapi
    // entrega às vezes vem sem o 9 mesmo quando o cadastro do hóspede foi salvo com ele (ou
    // vice-versa), o que faria uma comparação exata de dígitos nunca bater.
    const chatVariants = brazilPhoneVariants(phone);
    let stayId: string | null = null;
    if (chatVariants.length > 0) {
      const openStays = await prisma.stayCheckin.findMany({
        where: { tenantId, isClosed: false },
        orderBy: { checkInDate: "desc" },
        include: { primaryGuest: { select: { phone: true, whatsappPhone: true } } },
      });
      const match = openStays.find((s) => {
        const guestVariants = [
          ...brazilPhoneVariants(s.primaryGuest?.phone || ""),
          ...brazilPhoneVariants(s.primaryGuest?.whatsappPhone || ""),
        ];
        return guestVariants.some((v) => chatVariants.includes(v));
      });
      stayId = match?.id || null;
    }

    // data.type é "text" ou "media" (genérico); data.messageType é o nome bruto do protocolo (ex:
    // "Conversation", "ImageMessage"). Para mensagens de mídia, data.content traz os metadados do
    // arquivo (mimetype, fileLength, etc.) — confirmado testando o envio real de uma imagem via
    // webhook.site — mas data.content.URL é a URL criptografada original do WhatsApp (E2E), *não*
    // utilizável diretamente num <img>/link: para obter uma URL pública já descriptografada é
    // preciso chamar POST {serverUrl}/message/download com o messageid (ver
    // api/uazapi/messages/download), o que a tela "Mensagens WhatsApp" faz sob demanda ao abrir a
    // conversa. Por isso mediaUrl começa null aqui — só mimeType (metadado, não criptografado) é
    // conhecido de antemão.
    const type = (data?.type || "text") === "text" ? "text" : "media";
    const mimeType: string | null = type === "media" ? data?.content?.mimetype || data?.mediaType || null : null;
    const filename: string | null = data?.fileName || data?.filename || data?.content?.fileName || data?.content?.title || null;

    await prisma.whatsappMessage.create({
      data: {
        tenantId,
        stayId,
        phone,
        direction: "IN",
        type,
        content: data?.text || data?.content?.caption || null,
        filename,
        mediaUrl: null,
        mimeType,
        senderName: data?.senderName || null,
        externalId,
        read: false,
      },
    });

    await runGuestSupportAgent(tenantId, phone);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[POST /api/uazapi/webhook/[tenantId]] Erro:", error);
    // Sempre 200 para a uazapi não ficar retentando indefinidamente por um erro nosso.
    return NextResponse.json({ success: false, error: error.message || "Erro interno." });
  }
}
