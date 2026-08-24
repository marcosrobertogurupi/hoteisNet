import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// Master Token da Hub do Desenvolvedor: HoteisNet compra o crédito e revende aos
// assinantes através da cota mensal configurada por assinante (Tenant.cpfQueryQuotaMonthly).
// Só é configurável no Painel SuperAdmin / variáveis de ambiente — nunca pelo assinante.
// Sem fallback literal no código: se as variáveis de ambiente não existirem, a consulta
// simplesmente não funciona (branch "Nenhuma chave configurada" no fim deste arquivo).

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cpfParam = searchParams.get("cpf") || "";
    const cleanCpf = cpfParam.replace(/\D/g, "");

    if (!cleanCpf || cleanCpf.length !== 11) {
      return NextResponse.json(
        { success: false, message: "CPF inválido. Forneça 11 dígitos numéricos." },
        { status: 400 }
      );
    }

    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, message: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const tenantId = session.tenantId;

    let tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, cpfQueryQuotaMonthly: true, cpfQueryUsed: true, cpfQueryCycleStart: true, cpfQueryEnabled: true },
    });

    if (!tenant) {
      return NextResponse.json({ success: false, message: "Assinante não encontrado." }, { status: 404 });
    }

    if (!tenant.cpfQueryEnabled) {
      return NextResponse.json(
        {
          success: false,
          serviceDisabled: true,
          message: "A consulta de CPF não está habilitada para o seu plano. Entre em contato com o suporte para ativar.",
        },
        { status: 403 }
      );
    }

    // Reinicia a cota mensal automaticamente quando o ciclo atual é de um mês anterior.
    const now = new Date();
    const cycleExpired =
      tenant.cpfQueryCycleStart.getUTCFullYear() !== now.getUTCFullYear() ||
      tenant.cpfQueryCycleStart.getUTCMonth() !== now.getUTCMonth();

    if (cycleExpired) {
      tenant = await prisma.tenant.update({
        where: { id: tenant.id },
        data: { cpfQueryUsed: 0, cpfQueryCycleStart: now },
        select: { id: true, cpfQueryQuotaMonthly: true, cpfQueryUsed: true, cpfQueryCycleStart: true, cpfQueryEnabled: true },
      });
    }

    if (tenant.cpfQueryUsed >= tenant.cpfQueryQuotaMonthly) {
      return NextResponse.json(
        {
          success: false,
          quotaExceeded: true,
          tenantUsage: { used: tenant.cpfQueryUsed, limit: tenant.cpfQueryQuotaMonthly },
          message: `O limite mensal de consultas de CPF do seu hotel (${tenant.cpfQueryUsed} / ${tenant.cpfQueryQuotaMonthly} consultas) foi atingido. Entre em contato com o suporte para aumentar sua cota.`,
        },
        { status: 429 }
      );
    }

    const hubToken =
      process.env.HUB_DESENVOLVEDOR_TOKEN ||
      process.env.HUB_DEV_TOKEN ||
      process.env.HUB_DEV_CLIENT_ID ||
      process.env.HUB_DEV_API_KEY ||
      "";

    const hubContract =
      process.env.HUB_DESENVOLVEDOR_CONTRACT ||
      process.env.HUB_DEV_CONTRACT ||
      "";

    if (hubToken && hubToken.trim() !== "" && !hubToken.includes("your-")) {
      try {
        // Endpoint principal: /v2/cadastropf/ (ficha completa com endereço, telefones, e-mails)
        // Endpoint secundário: /v2/cpf/ (situação cadastral padrão da Receita Federal)
        let data: any = null;
        let fetchSuccess = false;

        const endpoints = [
          `https://ws.hubdodesenvolvedor.com.br/v2/cadastropf/?cpf=${cleanCpf}&token=${hubToken.trim()}&contract=${hubContract.trim()}`,
          `https://ws.hubdodesenvolvedor.com.br/v2/cpf/?cpf=${cleanCpf}&token=${hubToken.trim()}&contract=${hubContract.trim()}`,
        ];

        for (const endpointUrl of endpoints) {
          try {
            const externalRes = await fetch(endpointUrl, { cache: "no-store" });
            data = await externalRes.json();
            if (data && (data.status === true || data.status === "true")) {
              fetchSuccess = true;
              break;
            }
          } catch (err) {
            console.warn(`Attempt failed for ${endpointUrl}:`, err);
          }
        }

        if (fetchSuccess && data && (data.status === true || data.status === "true")) {
          const updatedTenant = await prisma.tenant.update({
            where: { id: tenant.id },
            data: { cpfQueryUsed: { increment: 1 } },
            select: { cpfQueryUsed: true, cpfQueryQuotaMonthly: true },
          });

          const result = data.result || {};
          const nome =
            result.nomeCompleto ||
            result.nome_da_pf ||
            result.nome_da_pessoa_fisica ||
            result.nome ||
            "";

          const dtNascRaw =
            result.dataDeNascimento ||
            result.data_nascimento ||
            ""; // DD/MM/YYYY

          let dtNascimentoISO = "";
          if (dtNascRaw.includes("/")) {
            const [dd, mm, yyyy] = dtNascRaw.split("/");
            dtNascimentoISO = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
          }

          const generoRaw = (result.genero || result.sexo || "").toUpperCase();
          const sexo = generoRaw.startsWith("F") ? "F" : "M";

          const nomeDaMae = result.nomeDaMae || result.nome_da_mae || "";
          const nomeDoPai = result.nomeDoPai || result.nome_do_pai || "";

          // Extrai Telefones
          let telefones: string[] = [];
          if (Array.isArray(result.listaTelefones) && result.listaTelefones.length > 0) {
            telefones = result.listaTelefones
              .map((t: any) => t.telefoneComDDD || t.telefone || t.numero)
              .filter(Boolean);
          } else if (Array.isArray(result.telefones)) {
            telefones = result.telefones;
          }

          // Extrai E-mails
          let emails: string[] = [];
          if (Array.isArray(result.listaEmails) && result.listaEmails.length > 0) {
            emails = result.listaEmails
              .map((e: any) => e.enderecoEmail || e.email)
              .filter(Boolean);
          } else if (Array.isArray(result.emails)) {
            emails = result.emails;
          }

          // Extrai Endereço Principal
          let logradouro = "";
          let numero = "";
          let complEnder = "";
          let bairro = "";
          let cidade = "";
          let uf = "";
          let cep = "";
          let enderecoCompleto = "";

          if (Array.isArray(result.listaEnderecos) && result.listaEnderecos.length > 0) {
            const end = result.listaEnderecos[0];
            logradouro = (end.logradouro || "").toUpperCase();
            numero = (end.numero || "").toUpperCase();
            complEnder = (end.complemento || "").toUpperCase();
            bairro = (end.bairro || "").toUpperCase();
            cidade = (end.cidade || end.municipio || "").toUpperCase();
            uf = (end.uf || "").toUpperCase();
            cep = end.cep || "";
            enderecoCompleto = `${logradouro}, ${numero || "S/N"}${complEnder ? ` (${complEnder})` : ""} - ${bairro}, ${cidade}/${uf} - CEP ${cep}`.toUpperCase();
          } else if (result.logradouro) {
            logradouro = (result.logradouro || "").toUpperCase();
            numero = (result.numero || "S/N").toUpperCase();
            complEnder = (result.complemento || "").toUpperCase();
            bairro = (result.bairro || "").toUpperCase();
            cidade = (result.municipio || result.cidade || "").toUpperCase();
            uf = (result.uf || "").toUpperCase();
            cep = result.cep || "";
            enderecoCompleto = `${logradouro}, ${numero} - ${bairro}, ${cidade}/${uf} - CEP ${cep}`.toUpperCase();
          }

          return NextResponse.json({
            success: true,
            isRealData: true,
            tenantUsage: {
              used: updatedTenant.cpfQueryUsed,
              limit: updatedTenant.cpfQueryQuotaMonthly,
              remaining: updatedTenant.cpfQueryQuotaMonthly - updatedTenant.cpfQueryUsed,
            },
            data: {
              nome: nome.toUpperCase(),
              cpf: cleanCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4"),
              dataNascimento: dtNascimentoISO,
              dataNascimentoBR: dtNascRaw,
              genero: sexo === "F" ? "Feminino" : "Masculino",
              sexo: sexo,
              nomeDaMae: nomeDaMae.toUpperCase(),
              nomeDoPai: nomeDoPai.toUpperCase(),
              situacaoCadastral: result.situacaoCadastral || result.situacao_cadastral || "REGULAR",
              enderecoCompleto,
              logradouro,
              numero,
              complEnder,
              bairro,
              cidade,
              uf,
              cep,
              telefones,
              emails,
              listaEnderecos: result.listaEnderecos || [],
              listaTelefones: result.listaTelefones || [],
              listaEmails: result.listaEmails || [],
            },
          });
        } else {
          return NextResponse.json(
            {
              success: false,
              isRealData: true,
              message:
                data?.return ||
                data?.message ||
                "Não foram localizados registros para este CPF, ou a chave de acesso expirou.",
            },
            { status: 400 }
          );
        }
      } catch (err: any) {
        return NextResponse.json(
          {
            success: false,
            message: `Falha na consulta do CPF: ${err.message}`,
          },
          { status: 502 }
        );
      }
    }

    // Nenhum token configurado globalmente pelo SuperAdmin ou em variável de ambiente
    return NextResponse.json(
      {
        success: false,
        requiresToken: true,
        message:
          "Nenhuma chave de acesso está configurada. Cadastre a chave no Painel SuperAdmin (/admin) em Configurações do Sistema.",
      },
      { status: 401 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Erro interno na consulta de CPF" },
      { status: 500 }
    );
  }
}
