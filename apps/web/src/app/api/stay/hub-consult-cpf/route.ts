import { NextRequest, NextResponse } from "next/server";

// Default registered Master Token for Hub do Desenvolvedor (SaaS central database)
const DEFAULT_HUB_TOKEN = "183262310hxRtwiDQAo330874544";
const DEFAULT_HUB_CONTRACT = "c2NqUUo0bFBLYzhuRmhrUWtvMXhUcjg4ZHFiTitCK1hBT3M4TDlRenllVT0=";

// Tenant Consumption Store (SaaS subscriber quota telemetry tracking)
const TENANT_USAGE_STORE: Record<string, { name: string; plan: string; limit: number; used: number }> = {
  "TNT-01": { name: "Pousada Sol & Mar", plan: "PRO", limit: 500, used: 142 },
  "TNT-02": { name: "Hotel Praia Azul", plan: "ENTERPRISE", limit: 2000, used: 680 },
  "TNT-03": { name: "Resort Montanha Real", plan: "ENTERPRISE", limit: 2000, used: 1420 },
  "TNT-04": { name: "Pousada Cantinho da Serra", plan: "STARTER", limit: 100, used: 38 },
  "TNT-05": { name: "Hotel Central Executivo", plan: "PRO", limit: 500, used: 498 },
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cpfParam = searchParams.get("cpf") || "";
    const customToken = searchParams.get("token") || "";
    const customContract = searchParams.get("contract") || "";
    const tenantId = searchParams.get("tenantId") || "TNT-01"; // Current subscriber ID
    const cleanCpf = cpfParam.replace(/\D/g, "");

    if (!cleanCpf || cleanCpf.length !== 11) {
      return NextResponse.json(
        { success: false, message: "CPF inválido. Forneça 11 dígitos numéricos." },
        { status: 400 }
      );
    }

    // Check Subscriber Quota & Usage
    let tenantInfo = TENANT_USAGE_STORE[tenantId];
    if (!tenantInfo) {
      tenantInfo = { name: `Assinante ${tenantId}`, plan: "PRO", limit: 500, used: 0 };
      TENANT_USAGE_STORE[tenantId] = tenantInfo;
    }

    if (tenantInfo.used >= tenantInfo.limit) {
      return NextResponse.json(
        {
          success: false,
          quotaExceeded: true,
          tenantUsage: {
            tenantId,
            used: tenantInfo.used,
            limit: tenantInfo.limit,
          },
          message: `A cota mensal de consultas CPF da API Hub do seu hotel (${tenantInfo.used} / ${tenantInfo.limit} consultas) foi atingida. Acesse o Painel Admin ou entre em contato com o suporte para upgrade de plano.`,
        },
        { status: 429 }
      );
    }

    // Check environment variables for Shared Master Token or Custom Subscriber Token
    const hubToken =
      customToken ||
      process.env.HUB_DESENVOLVEDOR_TOKEN ||
      process.env.HUB_DEV_TOKEN ||
      process.env.HUB_DEV_CLIENT_ID ||
      process.env.HUB_DEV_API_KEY ||
      DEFAULT_HUB_TOKEN;

    const hubContract =
      customContract ||
      process.env.HUB_DESENVOLVEDOR_CONTRACT ||
      process.env.HUB_DEV_CONTRACT ||
      DEFAULT_HUB_CONTRACT;

    if (hubToken && hubToken.trim() !== "" && !hubToken.includes("your-")) {
      try {
        // Primary Endpoint: /v2/cadastropf/ (Full CPF Profile with Address, Phones, Emails)
        // Secondary Endpoint: /v2/cpf/ (Standard Receita Federal CPF Status)
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
          // Increment tenant usage counter on successful consultation
          tenantInfo.used += 1;

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

          // Extract Telefones
          let telefones: string[] = [];
          if (Array.isArray(result.listaTelefones) && result.listaTelefones.length > 0) {
            telefones = result.listaTelefones
              .map((t: any) => t.telefoneComDDD || t.telefone || t.numero)
              .filter(Boolean);
          } else if (Array.isArray(result.telefones)) {
            telefones = result.telefones;
          }

          // Extract Emails
          let emails: string[] = [];
          if (Array.isArray(result.listaEmails) && result.listaEmails.length > 0) {
            emails = result.listaEmails
              .map((e: any) => e.enderecoEmail || e.email)
              .filter(Boolean);
          } else if (Array.isArray(result.emails)) {
            emails = result.emails;
          }

          // Extract Primary Endereço
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
              tenantId,
              used: tenantInfo.used,
              limit: tenantInfo.limit,
              remaining: tenantInfo.limit - tenantInfo.used,
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
                "A API Hub do Desenvolvedor não localizou registros para este CPF ou o Token de acesso expirou.",
            },
            { status: 400 }
          );
        }
      } catch (err: any) {
        return NextResponse.json(
          {
            success: false,
            message: `Falha na conexão com a API Hub do Desenvolvedor: ${err.message}`,
          },
          { status: 502 }
        );
      }
    }

    // No token configured globally in Admin or .env.local
    return NextResponse.json(
      {
        success: false,
        requiresToken: true,
        message:
          "Nenhum Token Master da API Hub do Desenvolvedor está configurado. Cadastre o Token no Painel SuperAdmin (/admin) em Configurações do Sistema ou na variável HUB_DESENVOLVEDOR_TOKEN em .env.local.",
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
