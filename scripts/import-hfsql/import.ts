/**
 * Importador do legado WinDev (HFSQL) → HoteisNet (Prisma/Supabase).
 *
 * Uso (na raiz do repositório):
 *   npx tsx scripts/import-hfsql/import.ts --dir C:\Users\Marcos\hfsql-export --phase 1,2          # SIMULAÇÃO
 *   npx tsx scripts/import-hfsql/import.ts --dir C:\Users\Marcos\hfsql-export --phase 1,2 --apply  # GRAVA
 *
 * Os JSONs vêm de export.ps1 (leitura ODBC). Regras deste importador:
 *  - Isolamento: o tenant é resolvido pelo CNPJ do Hotel.fic e TODA linha gravada leva esse
 *    tenantId. Nunca há update/delete em linha de outro tenant (só createMany com skipDuplicates
 *    e updates filtrados por tenantId).
 *  - Idempotente: ids determinísticos `hf<tenant8>-<tabela>-<idLegado>` + skipDuplicates; rodar de
 *    novo não duplica nem sobrescreve o que já foi importado ou editado.
 *  - Simulação por padrão: tudo roda dentro de uma transação que é desfeita no final. Só --apply grava.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

// ---------- argumentos ----------
const args = process.argv.slice(2);
const argVal = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const DIR = argVal("dir");
const APPLY = args.includes("--apply");
const PHASES = (argVal("phase") || "1,2").split(",").map((s) => s.trim());
if (!DIR) throw new Error("Informe --dir <pasta dos JSONs exportados>");

// ---------- leitura dos JSONs ----------
type Row = Record<string, any>;
const cache = new Map<string, Row[]>();
function T(name: string): Row[] {
  if (!cache.has(name)) {
    const f = path.join(DIR!, `${name}.json`);
    if (!fs.existsSync(f)) throw new Error(`JSON não encontrado: ${f} (rode export.ps1)`);
    cache.set(name, JSON.parse(fs.readFileSync(f, "utf8")));
  }
  return cache.get(name)!;
}

// ---------- utilidades ----------
const digits = (s: any) => (s == null ? null : String(s).replace(/\D/g, "") || null);
const str = (s: any) => (s == null ? null : String(s).trim() || null);
const num = (s: any) => (s == null || s === "" ? 0 : Number(s));
/** Telefones do legado às vezes vêm com o número repetido duas vezes ("9137294816" + "9137294816"). */
function phoneClean(s: any): string | null {
  const d = digits(s);
  if (!d) return null;
  const h = d.length / 2;
  if (Number.isInteger(h) && h >= 8 && d.slice(0, h) === d.slice(h)) return d.slice(0, h);
  return d;
}
const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const report: string[] = [];
const say = (m: string) => {
  console.log(m);
  report.push(m);
};

async function chunked<Tt>(items: Tt[], size: number, fn: (part: Tt[]) => Promise<any>) {
  for (let i = 0; i < items.length; i += size) await fn(items.slice(i, i + size));
}

class DryRunRollback extends Error {}

// ---------- contexto ----------
interface Ctx {
  tx: Prisma.TransactionClient;
  tenantId: string;
  /** id determinístico de uma linha do legado neste tenant */
  id: (tag: string, legacyId: any) => string;
}

// =====================================================================================
// FASE 1 — base: Hotel→Tenant, países, NCM, municípios, formas de pagamento, plano de contas, tarifas
// =====================================================================================
async function phase1(c: Ctx) {
  say("\n=== FASE 1 — base ===");
  const { tx, tenantId } = c;

  // --- Hotel → Tenant: só completa campos EM BRANCO (nunca sobrescreve o que o assinante já configurou)
  const h = T("Hotel")[0];
  const cur = await tx.tenant.findUnique({ where: { id: tenantId } });
  const fill: Record<string, any> = {};
  const want: Record<string, any> = {
    name: str(h.Hot_Razao),
    tradeName: str(h.Hot_Fantasia),
    street: str(h.Hot_Logradouro),
    number: str(h.Hot_Numero),
    neighborhood: str(h.Hot_Bairro),
    city: str(h.Hot_Cidade),
    state: str(h.Hot_UF),
    zipCode: digits(h.Hot_CEP),
    phone: digits(h.Hot_Telefone),
    stateRegistration: str(h.Hot_IE),
    website: str(h.Hot_Site),
    interestRate: h.Hot_Juros != null ? new Prisma.Decimal(h.Hot_Juros) : null,
  };
  for (const [k, v] of Object.entries(want)) if (v != null && (cur as any)[k] == null) fill[k] = v;
  if (Object.keys(fill).length) {
    await tx.tenant.updateMany({ where: { id: tenantId }, data: fill });
  }
  say(`Tenant: campos em branco preenchidos = ${Object.keys(fill).join(", ") || "(nenhum — já estava completo)"}`);

  // --- Países (referência global). O legado não tem ISO: casa pelo nome em português.
  const dn = new Intl.DisplayNames(["pt-BR"], { type: "region" });
  const isoByName = new Map<string, string>();
  for (let a = 65; a <= 90; a++)
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a) + String.fromCharCode(b);
      try {
        const n = dn.of(code);
        if (n && n !== code) isoByName.set(norm(n), code);
      } catch {
        /* código inexistente */
      }
    }
  const alias: Record<string, string> = {
    "estados unidos da america": "US", eua: "US", "reino unido": "GB", inglaterra: "GB", "coreia do sul": "KR",
    "coreia do norte": "KP", russia: "RU", "republica tcheca": "CZ", tchequia: "CZ", "costa do marfim": "CI",
    "timor leste": "TL", "birmania": "MM", "cabo verde": "CV", "bielorrussia": "BY", "vaticano": "VA",
    // grafias do legado (palavras coladas, variantes de Portugal, sufixos)
    anguilla: "AI", bahrein: "BH", benim: "BJ", botswana: "BW", "burkina faso": "BF",
    "republica popular da china": "CN", "republica da china": "TW", congobrazzaville: "CG", congokinshasa: "CD", egipto: "EG",
    guinebissau: "GW", "hong kong": "HK", "ilhas cocos": "CC", "ilhas feroe": "FO", "ilha heard e ilhas mcdonald": "HM",
    kiribati: "KI", macau: "MO", "republica da macedonia": "MK", malawi: "MW", mauricia: "MU", "estados federados da micronesia": "FM",
    myanmar: "MM", palestina: "PS", "papuanova guine": "PG", qatar: "QA", "republica centroafricana": "CF",
    "santa helena territorio": "SH", "sao marinho": "SM", "saintpierre e miquelon": "PM", suazilandia: "SZ", timorleste: "TL",
    "turcas e caicos": "TC", turquemenistao: "TM",
  };
  const existingCountries = await tx.country.findMany({ select: { name: true, isoCode: true } });
  const haveName = new Set(existingCountries.map((x) => norm(x.name)));
  const usedIso = new Set(existingCountries.map((x) => x.isoCode).filter(Boolean) as string[]);
  const newCountries: Prisma.CountryCreateManyInput[] = [];
  const noIso: string[] = [];
  for (const p of T("Paises")) {
    const name = str(p.Pai_Nome);
    if (!name || haveName.has(norm(name))) continue;
    let iso: string | null = isoByName.get(norm(name)) || alias[norm(name)] || null;
    if (iso && usedIso.has(iso)) iso = null;
    if (iso) usedIso.add(iso);
    else noIso.push(name);
    newCountries.push({ id: `hf-country-${p.Pai_ID}`, name, isoCode: iso, dialCode: str(p.Pai_DDi) });
  }
  const rc = await tx.country.createMany({ data: newCountries, skipDuplicates: true });
  say(`Países: ${rc.count} novos (de ${T("Paises").length}); sem código ISO (${noIso.length}): ${noIso.join(", ") || "-"}`);

  // --- NCM (referência global)
  const ncmRows = T("NCM").filter((n) => str(n.NCM_Codigo)).map((n) => ({ code: str(n.NCM_Codigo)!, description: str(n.NCM_Descricao) || "" }));
  let ncmNew = 0;
  await chunked(ncmRows, 2000, async (part) => {
    ncmNew += (await tx.ncm.createMany({ data: part, skipDuplicates: true })).count;
  });
  say(`NCM: ${ncmNew} novos (de ${ncmRows.length})`);

  // --- Municípios: já existem (referência global); só confere
  const mun = await tx.municipality.count();
  const codes = new Set((await tx.municipality.findMany({ select: { ibgeCode: true } })).map((m) => m.ibgeCode));
  const missing = T("CidadesNet").filter((x) => x.Cid_CodIBGE && !codes.has(String(x.Cid_CodIBGE)));
  const munData: Prisma.MunicipalityCreateManyInput[] = missing.map((x) => ({
    id: `hf-mun-${x.Cid_ID}`, name: String(x.Cid_NOME), ibgeCode: String(x.Cid_CodIBGE), uf: String(x.Cid_UF || ""), dddCode: str(x.Cid_DDD),
  }));
  if (munData.length) await tx.municipality.createMany({ data: munData, skipDuplicates: true });
  say(`Municípios: ${mun} já existiam; ${munData.length} faltantes incluídos (legado: ${T("CidadesNet").length})`);

  // --- Formas de pagamento
  const pm = T("FormaPagt").map((f) => {
    const nome = String(f.ForPag_Nome).trim();
    const cat = /DINHEIRO/i.test(nome) ? "DINHEIRO" : /PIX/i.test(nome) ? "PIX" : "OUTRO";
    return {
      id: c.id("forpag", f.ForPag_ID), tenantId, description: nome,
      installment: !!f.ForPag_Parcelamento, debitGuestBalance: !!f.ForPag_DebSalHos, transferDebit: !!f.ForPag_Transferencia,
      sumsToCashRegister: !!f.ForPag_SomaCaixa, pdvCategory: cat as any,
    };
  });
  say(`Formas de pagamento: ${(await tx.paymentMethod.createMany({ data: pm, skipDuplicates: true })).count} novas (de ${pm.length})`);

  // --- Plano de contas
  const ap = T("PLContas").map((p) => {
    const code = String(p.PLC_Codigo).trim();
    return {
      id: c.id("plc", p.PLC_ID), tenantId, code, description: String(p.PLC_Descricao).trim(),
      type: code.startsWith("02") ? "RECEITA" : "DESPESA",
      level: p.PLC_TIPO === "S" ? "Sintética" : "Analítica",
      creditoDebito: p.PLC_CrDb === "C" ? "CREDITO" : "DEBITO",
    };
  });
  say(`Plano de contas: ${(await tx.accountPlan.createMany({ data: ap, skipDuplicates: true })).count} novas (de ${ap.length})`);

  // --- Tarifas
  const tf = T("TarifasNet").map((t) => ({
    id: c.id("tarifa", t.Tar_ID), tenantId, name: String(t.Tar_Descricao).trim(), adults: Math.max(1, Number(t.Tar_QtdAdulto) || 1), price: new Prisma.Decimal(num(t.Tar_VlrAdulto)),
  }));
  say(`Tarifas: ${(await tx.tariff.createMany({ data: tf, skipDuplicates: true })).count} novas (de ${tf.length})`);
}

// =====================================================================================
// FASE 2 — cadastros: quartos, produtos, empresas, colaboradores
// =====================================================================================
function bedsFromDescription(desc: string | null): { casal: number; solteiro: number } {
  if (!desc) return { casal: 0, solteiro: 0 };
  const d = norm(desc);
  let casal = 0, solteiro = 0;
  const m = (re: RegExp) => [...d.matchAll(re)];
  // "1 cama de casal", "cama de casal", "1 cama de casa" (erro de digitação do legado), "cama casal"
  for (const x of m(/(?:(\d+)\s+)?cama(?:s)?\s+(?:de\s+)?(?:casal|casa)\b/g)) casal += x[1] ? Number(x[1]) : 1;
  // "1 solteiro", "2 solteiro", "cama solteiro", "3 camas de solteiro", "casal + solteiro"
  for (const x of m(/(?:(\d+)\s+)?(?:camas?\s+(?:de\s+)?)?solteiro/g)) solteiro += x[1] ? Number(x[1]) : 1;
  return { casal, solteiro };
}

async function phase2(c: Ctx) {
  say("\n=== FASE 2 — cadastros ===");
  const { tx, tenantId } = c;

  // --- Andares (LocalApto)
  const locs = T("LocalApto");
  const locName = new Map(locs.map((l) => [String(l.Loc_ID), String(l.Loc_Descricao).trim()]));
  const fl = locs.map((l) => ({ id: c.id("local", l.Loc_ID), tenantId, name: String(l.Loc_Descricao).trim() }));
  say(`Andares: ${(await tx.floor.createMany({ data: fl, skipDuplicates: true })).count} novos (de ${fl.length})`);

  // --- Categorias de quarto. Capacidade = maior nº de adultos entre as tarifas da categoria.
  const tariffs = T("TarifasNet");
  const cats = T("CategoriaApto");
  const capFor = (nome: string) => {
    const key = norm(nome).replace("standar", "standar");
    const adults = tariffs.filter((t) => norm(t.Tar_Descricao).includes(key)).map((t) => Number(t.Tar_QtdAdulto) || 1);
    return adults.length ? Math.max(...adults) : 2;
  };
  // O AUDITORIO está na categoria ESPECIAL no legado; aqui vira categoria própria de espaço de eventos
  // (o SaaS decide "não é diária" no nível da categoria) — a ESPECIAL continua como hospedagem.
  const roomCats: Prisma.RoomCategoryCreateManyInput[] = cats.map((k) => ({
    id: c.id("cat", k.Cat_ID), tenantId, name: String(k.Cat_Descricao).trim(), capacity: capFor(String(k.Cat_Descricao)), dailyPrice: 0,
  }));
  const AUD_CAT = c.id("cat", "auditorio");
  roomCats.push({ id: AUD_CAT, tenantId, name: "AUDITORIO", capacity: 100, dailyPrice: 0, kind: "EVENT_SPACE" as any, description: "80 A 100 PESSOAS" });
  say(`Categorias de quarto: ${(await tx.roomCategory.createMany({ data: roomCats, skipDuplicates: true })).count} novas (de ${roomCats.length})`);

  // --- Quartos
  const caractName = new Map(T("CaractApto").map((x) => [String(x.Carc_ID), String(x.Carc_Descricao).trim()]));
  const carByRoom = new Map<string, string[]>();
  for (const x of T("AptoCaract")) {
    const n = caractName.get(String(x.ApC_IDCaract));
    if (!n) continue;
    const k = String(x.ApC_IDApto);
    carByRoom.set(k, [...(carByRoom.get(k) || []), n]);
  }
  const statusOf = (s: string) => (s === "O" ? "OCCUPIED" : s === "L" ? "VACANT_DIRTY" : "VACANT_CLEAN");
  const rooms: Prisma.RoomCreateManyInput[] = T("Apartamentos").map((a) => {
    const number = String(a.Ap_NoAp).trim();
    const isAud = norm(number) === "auditorio";
    const beds = bedsFromDescription(str(a.Ap_Descricao));
    return {
      id: c.id("apto", a.Ap_ID), tenantId,
      categoryId: isAud ? AUD_CAT : c.id("cat", a.Ap_Categoria),
      number, floor: locName.get(String(a.Ap_Local)) || null,
      camasCasal: beds.casal, camasSolteiro: beds.solteiro,
      caracteristicas: carByRoom.get(String(a.Ap_ID)) || [],
      status: statusOf(String(a.Ap_Situacao)) as any,
      notes: str(a.Ap_Descricao),
    };
  });
  say(`Quartos: ${(await tx.room.createMany({ data: rooms, skipDuplicates: true })).count} novos (de ${rooms.length})`);
  const unbedded = rooms.filter((r) => !r.camasCasal && !r.camasSolteiro && !/auditorio/i.test(r.number)).map((r) => r.number);
  if (unbedded.length) say(`  ⚠ quartos sem camas reconhecidas na descrição: ${unbedded.join(", ")}`);

  // --- Grupos e tipos de produto
  const grp = T("Grupos").map((g) => ({
    id: c.id("grupo", g.Gru_ID), tenantId, name: String(g.Gru_Descricao).trim(),
    type: /SERVI/i.test(g.Gru_Descricao) ? "SERVICO" : "PRODUTO",
  }));
  say(`Grupos de produto: ${(await tx.productGroup.createMany({ data: grp, skipDuplicates: true })).count} novos (de ${grp.length})`);
  const tip = T("TipoProduto").map((t) => ({ id: c.id("tipoprod", t.TipP_ID), tenantId, code: str(t.TipP_Codigo), name: String(t.TipP_Descricao).trim() }));
  say(`Tipos de produto: ${(await tx.productType.createMany({ data: tip, skipDuplicates: true })).count} novos (de ${tip.length})`);

  // --- Produtos
  const unidade = new Map(T("Unidade").map((u) => [String(u.Un_ID), String(u.Un_Unidade).trim()]));
  const grupoNome = new Map(T("Grupos").map((g) => [String(g.Gru_ID), String(g.Gru_Descricao).trim()]));
  const ok = (id: any) => id != null && String(id) !== "-1" && String(id) !== "0";
  const prods = T("Produtos").map((p) => ({
    id: c.id("prod", p.Prod_ID), tenantId, name: String(p.Prod_Descricao).trim(), reference: str(p.Prod_Referencia),
    category: ok(p.Prod_IDGrupo) ? grupoNome.get(String(p.Prod_IDGrupo)) || null : null,
    groupId: ok(p.Prod_IDGrupo) ? c.id("grupo", p.Prod_IDGrupo) : null,
    productTypeId: ok(p.Prod_TipoProd) ? c.id("tipoprod", p.Prod_TipoProd) : null,
    unit: ok(p.Prod_Unidade) ? unidade.get(String(p.Prod_Unidade)) || "UN" : "UN", brand: str(p.Prod_Marca),
    costPrice: new Prisma.Decimal(num(p.Prod_PrecoCusto)), salePrice: new Prisma.Decimal(num(p.Prod_PrecoVenda01)),
    generalStock: Math.round(num(p.Prod_Estoque)), minStock: Math.round(num(p.Prod_EstMinimo)),
    maxStock: num(p.Prod_EstMaximo) > 0 ? Math.round(num(p.Prod_EstMaximo)) : null,
    ncm: str(p.Prod_NCM), cest: str(p.Prod_CEST),
  }));
  say(`Produtos: ${(await tx.product.createMany({ data: prods, skipDuplicates: true })).count} novos (de ${prods.length})`);
  const multiPrice = T("Produtos").filter((p) => num(p.Prod_PrecoVenda02) || num(p.Prod_PrecoVenda03)).length;
  if (multiPrice) say(`  ⚠ ${multiPrice} produto(s) têm preço de venda 2/3 no legado; só o preço 1 foi importado (o SaaS tem um único preço).`);

  // --- Códigos de barras: `code` é ÚNICO no banco todo (entre tenants). Conflitos são pulados e listados.
  const cb = T("ProdCodBarras").filter((b) => str(b.CodB_CodBarra));
  const taken = new Set((await tx.productBarcode.findMany({ where: { code: { in: cb.map((b) => String(b.CodB_CodBarra).trim()) } }, select: { code: true } })).map((x) => x.code));
  const barData: Prisma.ProductBarcodeCreateManyInput[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const b of cb) {
    const code = String(b.CodB_CodBarra).trim();
    if (taken.has(code) || seen.has(code)) { skipped.push(code); continue; }
    seen.add(code);
    barData.push({ id: c.id("codb", b.CodB_ID), productId: c.id("prod", b.CodB_IDProd), code });
  }
  say(`Códigos de barras: ${(await tx.productBarcode.createMany({ data: barData, skipDuplicates: true })).count} novos (de ${cb.length}); pulados por já existirem em outro cadastro: ${skipped.length}${skipped.length ? " → " + skipped.join(",") : ""}`);

  // --- Empresas conveniadas
  const tels = new Map<string, Row[]>();
  for (const t of T("EmpTelefones")) tels.set(String(t.EmpT_IDEmp), [...(tels.get(String(t.EmpT_IDEmp)) || []), t]);
  const mails = new Map<string, Row[]>();
  for (const m of T("EmailEmp")) mails.set(String(m.EmailE_IDEmp), [...(mails.get(String(m.EmailE_IDEmp)) || []), m]);
  const comps = T("Empresas").map((e) => {
    const ph = (tels.get(String(e.Emp_ID)) || []).map((t) => ({ number: phoneClean(t.EmpT_Telefone), description: str(t.EmpT_Descricao), primary: !!t.EmpT_Principal })).filter((t) => t.number);
    const em = (mails.get(String(e.Emp_ID)) || []).map((m) => ({ email: str(m.EmailE_Email), description: str(m.EmailE_Descricao), primary: !!m.EmailE_Principal })).filter((m) => m.email);
    const socios = T("SocioEmp").filter((s) => String(s.SocE_IDEmp) === String(e.Emp_ID));
    const notes = [str(e.Emp_Observacao), e.Emp_Bloqueado ? "[Bloqueada no sistema legado]" : null, ...socios.map((s) => `Sócio: ${s.SocE_Socio} ${s.SocE_CPFSocio || ""}`.trim())].filter(Boolean).join("\n") || null;
    return {
      id: c.id("emp", e.Emp_ID), tenantId, name: String(e.Emp_Razao).trim(), tradeName: str(e.Emp_Fantasia), cnpj: digits(e.Emp_CNPJ) || "",
      ie: str(e.Emp_IE), address: str(e.Emp_Logradouro), number: str(e.Emp_Numero), complement: str(e.Emp_CompEnd), neighborhood: str(e.Emp_Bairro),
      city: str(e.Emp_Cidade), state: str(e.Emp_UF), zipCode: digits(e.Emp_CEP),
      billingAddress: str(e.Emp_LograCobr), billingNumber: str(e.Emp_NumCobr), billingComplement: str(e.Emp_CompEndCobr), billingNeighborhood: str(e.Emp_BaiCobr),
      billingCity: str(e.Emp_CidCobr), billingState: str(e.Emp_UFCobr), billingZipCode: digits(e.Emp_CEPCobr),
      phone: ph.find((p) => p.primary)?.number || ph[0]?.number || null, email: em.find((m) => m.primary)?.email || em[0]?.email || null,
      phones: ph.length ? (ph as any) : undefined, emails: em.length ? (em as any) : undefined, notes,
    } as Prisma.CompanyCreateManyInput;
  });
  say(`Empresas: ${(await tx.company.createMany({ data: comps, skipDuplicates: true })).count} novas (de ${comps.length})`);

  // --- Colaboradores
  const emp = T("Colaborador").map((x) => ({ id: c.id("colab", x.Col_ID), tenantId, name: String(x.Col_Nome).trim(), role: str(x.Col_Setor), phone: phoneClean(x.Col_Telefone) }));
  say(`Colaboradores: ${(await tx.employee.createMany({ data: emp, skipDuplicates: true })).count} novos (de ${emp.length})`);
}

// =====================================================================================
const PHASE_FNS: Record<string, (c: Ctx) => Promise<void>> = { "1": phase1, "2": phase2 };

async function main() {
  const hotel = T("Hotel")[0];
  const cnpj = digits(hotel.Hot_CNPJHot);
  if (!cnpj) throw new Error("Hotel.fic sem CNPJ");
  const tenant = await prisma.tenant.findUnique({ where: { cnpj }, select: { id: true, name: true } });
  if (!tenant) throw new Error(`Nenhum tenant com CNPJ ${cnpj}. Crie o assinante antes de importar.`);
  console.log(`\n${APPLY ? "⚠ MODO GRAVAÇÃO" : "SIMULAÇÃO (nada será gravado)"} — tenant ${tenant.name} (${tenant.id}) — fases ${PHASES.join(",")}`);

  const short = tenant.id.replace(/-/g, "").slice(0, 8);
  try {
    await prisma.$transaction(
      async (tx) => {
        const ctx: Ctx = { tx, tenantId: tenant.id, id: (tag, legacy) => `hf${short}-${tag}-${legacy}` };
        for (const p of PHASES) {
          const fn = PHASE_FNS[p];
          if (!fn) throw new Error(`Fase desconhecida: ${p}`);
          await fn(ctx);
        }
        if (!APPLY) throw new DryRunRollback();
      },
      { timeout: 900_000, maxWait: 60_000 },
    );
    console.log("\n✅ Gravado.");
  } catch (e) {
    if (e instanceof DryRunRollback) console.log("\n↩ Simulação concluída — transação desfeita, nada foi gravado.");
    else throw e;
  }
}

main()
  .catch((e) => {
    console.error("\n❌", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
