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
  // Ocupação vem só de hospedagem ativa (nenhuma é importada como ativa — ver fase 4): "O" (ocupado) vira vago/limpo.
  const statusOf = (s: string) => (s === "L" ? "VACANT_DIRTY" : "VACANT_CLEAN");
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
// FASE 3 — hóspedes: HospedeNet + telefones, e-mails, veículos
// =====================================================================================
/** Data/hora sem fuso do legado é horário de Brasília (America/Sao_Paulo, sem horário de verão desde 2019). */
const dt = (s: any): Date | null => (s ? new Date(String(s) + "-03:00") : null);
const dateOnly = (s: any): Date | null => (s ? new Date(String(s).slice(0, 10) + "T00:00:00.000Z") : null);
const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)(\S)/g, (_, a, b) => a + b.toUpperCase());

async function phase3(c: Ctx) {
  say("\n=== FASE 3 — hóspedes ===");
  const { tx, tenantId } = c;

  // países (para nacionalidade ISO e nome do país)
  const cty = new Map((await tx.country.findMany({ where: { id: { startsWith: "hf-country-" } }, select: { id: true, name: true, isoCode: true } })).map((x) => [x.id, x]));
  const companies = new Set((await tx.company.findMany({ where: { tenantId, id: { startsWith: "hf" } }, select: { id: true } })).map((x) => x.id));

  // telefones por hóspede: distintos por dígitos (sem zeros à esquerda); principal primeiro
  type Ph = { number: string; description: string | null; isPrimary: boolean; whatsappId: string | null; photo: string | null; legacyId: string };
  const guestIds = new Set(T("HospedeNet").map((h) => String(h.Hos_ID)));
  const phonesBy = new Map<string, Ph[]>();
  let orphanPh = 0;
  const tels = [...T("TelefonesHospede")].sort((a, b) => Number(b.TelHos_TelPrincipal) - Number(a.TelHos_TelPrincipal) || Number(a.TelHos_ID) - Number(b.TelHos_ID));
  for (const t of tels) {
    const gid = String(t.TelHos_IDHospede);
    if (!guestIds.has(gid)) { orphanPh++; continue; }
    const number = (digits(t.TelHos_Telefone) || "").replace(/^0+/, "");
    if (number.length < 8) continue;
    const list = phonesBy.get(gid) || [];
    const jid = str(t.TelHos_Wpp);
    const ex = list.find((p) => p.number === number);
    if (ex) { ex.whatsappId ||= jid; ex.photo ||= str(t.TelHos_FotoPerfil); continue; }
    list.push({ number, description: str(t.TelHos_Descricao), isPrimary: list.length === 0, whatsappId: jid, photo: str(t.TelHos_FotoPerfil), legacyId: String(t.TelHos_ID) });
    phonesBy.set(gid, list);
  }
  const emailsBy = new Map<string, { email: string; isPrimary: boolean; legacyId: string }[]>();
  let orphanEm = 0;
  const mails = [...T("EmailHospedeNet")].sort((a, b) => Number(b.EmailHos_Principal) - Number(a.EmailHos_Principal) || Number(a.EmailHos_ID) - Number(b.EmailHos_ID));
  for (const m of mails) {
    const gid = String(m.EmailHos_IDHospede);
    if (!guestIds.has(gid)) { orphanEm++; continue; }
    const email = (str(m.EmailHos_Email) || "").toLowerCase();
    if (!email.includes("@")) continue;
    const list = emailsBy.get(gid) || [];
    if (list.some((e) => e.email === email)) continue;
    list.push({ email, isPrimary: list.length === 0, legacyId: String(m.EmailHos_ID) });
    emailsBy.set(gid, list);
  }

  const genderOf = (g: any) => (/^m/i.test(String(g)) ? "M" : /^f/i.test(String(g)) ? "F" : "O");
  const guests: Prisma.GuestCreateManyInput[] = T("HospedeNet").map((h) => {
    const id = String(h.Hos_ID);
    const phones = phonesBy.get(id) || [];
    const primary = phones[0];
    const jidPhone = phones.find((p) => p.whatsappId);
    const wpp = jidPhone ? digits(jidPhone.whatsappId!.split("@")[0]) : null;
    const country = cty.get(`hf-country-${h.Hos_IDPais}`);
    const isBR = !country || country.isoCode === "BR";
    const compl = str(h.Hos_ComplEndereco);
    const complement = compl && compl !== "0" ? compl : null;
    const emp = h.Hos_IDEmpresa && !["0", "-1"].includes(String(h.Hos_IDEmpresa)) ? c.id("emp", h.Hos_IDEmpresa) : null;
    const cidade = str(h.Hos_Cidade);
    return {
      id: c.id("hosp", id), tenantId, fullName: String(h.Hos_Nome).trim(), cpf: digits(h.Hos_CPF), passport: str(h.Hos_Passaporte),
      birthDate: dateOnly(h.Hos_DtNascimento), gender: genderOf(h.Hos_Sexo),
      email: emailsBy.get(id)?.[0]?.email || null, phone: primary?.number || null, whatsappPhone: wpp || primary?.number || null, hasWhatsapp: !!wpp,
      zipCode: digits(h.Hos_CEP), street: str(h.Hos_Logradouro), number: str(h.Hos_Numero), neighborhood: str(h.Hos_Bairro),
      city: cidade, state: str(h.Hos_UF), country: isBR ? "Brasil" : titleCase(country!.name), nationality: country?.isoCode || "BR",
      motherName: str(h.Hos_Mae), fatherName: str(h.Hos_Pai), occupation: str(h.Hos_Profissao),
      rgNumber: str(h.Hos_Documento), rgIssuer: str(h.Hos_OrgaoExped),
      fullAddress: complement ? [str(h.Hos_Logradouro), str(h.Hos_Numero), complement, str(h.Hos_Bairro), cidade && `${cidade}/${str(h.Hos_UF) || ""}`].filter(Boolean).join(", ") : null,
      companyId: emp && companies.has(emp) ? emp : null,
    };
  });
  let gN = 0;
  await chunked(guests, 500, async (p) => { gN += (await tx.guest.createMany({ data: p, skipDuplicates: true })).count; });
  say(`Hóspedes: ${gN} novos (de ${guests.length})`);
  const cpfCount = new Map<string, number>();
  for (const g of guests) if (g.cpf) cpfCount.set(g.cpf, (cpfCount.get(g.cpf) || 0) + 1);
  say(`  ℹ ${[...cpfCount.values()].filter((n) => n > 1).length} CPFs aparecem em mais de um cadastro (mantidos como no legado, pois hospedagens apontam para cada um); ${guests.filter((g) => !g.cpf).length} sem CPF.`);

  const phRows: Prisma.GuestPhoneCreateManyInput[] = [];
  for (const [gid, list] of phonesBy) for (const p of list) phRows.push({ id: c.id("telh", p.legacyId), tenantId, guestId: c.id("hosp", gid), number: p.number, description: p.description, isPrimary: p.isPrimary, whatsappId: p.whatsappId, profilePhotoUrl: p.photo });
  let pN = 0;
  await chunked(phRows, 1000, async (p) => { pN += (await tx.guestPhone.createMany({ data: p, skipDuplicates: true })).count; });
  say(`Telefones: ${pN} novos (legado ${T("TelefonesHospede").length}; duplicados/vazios agrupados; ${orphanPh} de hóspede inexistente descartados)`);

  const emRows: Prisma.GuestEmailCreateManyInput[] = [];
  for (const [gid, list] of emailsBy) for (const e of list) emRows.push({ id: c.id("emailh", e.legacyId), tenantId, guestId: c.id("hosp", gid), email: e.email, isPrimary: e.isPrimary });
  let eN = 0;
  await chunked(emRows, 1000, async (p) => { eN += (await tx.guestEmail.createMany({ data: p, skipDuplicates: true })).count; });
  say(`E-mails: ${eN} novos (legado ${T("EmailHospedeNet").length}; duplicados agrupados; ${orphanEm} de hóspede inexistente descartados)`);

  const veh = T("Veiculos").filter((v) => str(v.Vei_Placa) && guestIds.has(String(v.Vei_IDHospede))).map((v) => ({
    id: c.id("vei", v.Vei_ID), tenantId, guestId: c.id("hosp", v.Vei_IDHospede), placa: String(v.Vei_Placa).trim().toUpperCase(), caracteristica: str(v.Vei_CaractVei),
  }));
  let vN = 0;
  await chunked(veh, 1000, async (p) => { vN += (await tx.vehicle.createMany({ data: p, skipDuplicates: true })).count; });
  say(`Veículos: ${vN} novos (de ${T("Veiculos").length})`);
}

// =====================================================================================
// FASE 4 — hospedagens: StayCheckin + diárias, hóspedes acompanhantes, consumo, transferência de débito
//
// O backup do legado é um retrato de 08/02/2026. As hospedagens "abertas" nele (sem Hpd_DtFecham)
// NÃO são importadas como ativas: a virada automática de diárias do SaaS cobraria meses de diárias
// em cima delas e os quartos apareceriam ocupados. Entram ENCERRADAS na saída prevista, com os
// valores exatamente como estavam (saldo a pagar preservado) e listadas no relatório para conferência.
// =====================================================================================
const dayKey = (s: any) => String(s).slice(0, 10);
const refDate = (day: string) => new Date(`${day}T03:00:00.000Z`); // meia-noite de Brasília — mesma convenção de lib/dailyRollover.ts

/** id estável do operador do legado (usuários não são importados; só o nome e um id rastreável). */
function operatorFor(acessoById: Map<string, string>, idOrName: any): { id: string | null; name: string | null } {
  const raw = str(idOrName);
  if (!raw || raw === "0" || raw === "-1") return { id: null, name: null };
  if (acessoById.has(raw)) return { id: `hf-usuario-${raw}`, name: acessoById.get(raw)! };
  return { id: null, name: null };
}

async function phase4(c: Ctx) {
  say("\n=== FASE 4 — hospedagens ===");
  const { tx, tenantId } = c;

  const acesso = new Map(T("Acesso").map((a) => [String(a.Ace_ID), String(a.Ace_NomeUsuario).trim()]));
  const roomIds = new Map(T("Apartamentos").map((a) => [String(a.Ap_ID), String(a.Ap_NoAp).trim()]));
  const guestName = new Map(T("HospedeNet").map((g) => [String(g.Hos_ID), String(g.Hos_Nome).trim()]));
  const tariffName = new Map(T("TarifasNet").map((t) => [String(t.Tar_ID), String(t.Tar_Descricao).trim()]));
  const products = new Map(T("Produtos").map((p) => [String(p.Prod_ID), String(p.Prod_Descricao).trim()]));

  const stays: Prisma.StayCheckinCreateManyInput[] = [];
  const stayIds = new Set<string>();
  const openStays: string[] = [];
  let skippedNoRoom = 0, skippedNoGuest = 0;
  for (const h of T("HospedagemNet")) {
    const id = String(h.Hpd_ID);
    if (!roomIds.has(String(h.Hpd_IDQuarto))) { skippedNoRoom++; continue; }
    if (!guestName.has(String(h.Hpd_IDHospPrinc))) { skippedNoGuest++; continue; }
    const wasOpen = !h.Hpd_DtFecham;
    const checkIn = dt(h.Hpd_DtChegada)!;
    const expected = dt(h.Hpd_DtSaida) || checkIn;
    const closedAt = dt(h.Hpd_DtFecham) || expected;
    if (wasOpen) openStays.push(`${roomIds.get(String(h.Hpd_IDQuarto))}#${id} (${dayKey(h.Hpd_DtChegada)}→${dayKey(h.Hpd_DtSaida)}, saldo R$ ${num(h.hpd_SaldoPagar).toFixed(2)})`);
    const inBy = operatorFor(acesso, h.Hpd_IdUsuChecking);
    const outBy = operatorFor(acesso, h.Hpd_IdUsuCheckout !== "0" ? h.Hpd_IdUsuCheckout : h.Hpd_OperadorFechou);
    const closer = operatorFor(acesso, h.Hpd_OperadorFechou);
    stays.push({
      id: c.id("hpd", id), tenantId, roomId: c.id("apto", h.Hpd_IDQuarto), primaryGuestId: c.id("hosp", h.Hpd_IDHospPrinc),
      checkInDate: checkIn, expectedCheckOut: expected, actualCheckOut: closedAt, isClosed: true,
      totalDaily: new Prisma.Decimal(num(h.Hpd_TotalBrtDiarias)), totalConsumption: new Prisma.Decimal(num(h.Hpd_TotalConsumo)), discount: new Prisma.Decimal(num(h.Hpd_TotalDesc)),
      adults: Math.max(0, Number(h.Hpd_QtdAdulto) || 0), children: Math.max(0, Number(h.Hpd_QtdCrianca) || 0),
      dailiesCount: Math.max(0, Number(h.Hpd_QtdDiarias) || 0), extraDailiesCount: Math.max(0, Number(h.Hpd_QtdDiariasExtras) || 0), lastRolloverDate: closedAt,
      checkedInByUserId: inBy.id, checkedInByUserName: inBy.name, checkedOutByUserId: outBy.id, checkedOutByUserName: outBy.name,
      closingOperatorId: closer.id, closingOperatorName: closer.name,
      totalAdvance: new Prisma.Decimal(num(h.Hpd_TotalAdiant)), balanceDue: new Prisma.Decimal(num(h.hpd_SaldoPagar)), otherDebits: new Prisma.Decimal(num(h.Hpd_OutrosDeb)),
    });
    stayIds.add(id);
  }
  let sN = 0;
  await chunked(stays, 500, async (p) => { sN += (await tx.stayCheckin.createMany({ data: p, skipDuplicates: true })).count; });
  say(`Hospedagens: ${sN} novas (de ${T("HospedagemNet").length}); sem quarto válido: ${skippedNoRoom}; sem hóspede válido: ${skippedNoGuest}`);
  say(`  ⚠ ${openStays.length} hospedagens estavam ABERTAS no backup (08/02/2026) e entraram ENCERRADAS na saída prevista, com os valores do legado (nenhuma diária nova é gerada):`);
  say(`    ${openStays.join("; ")}`);

  // --- Diárias (HospedagemTarifa → StayCharge), uma por dia; unique (stay, referenceDate)
  const charges: Prisma.StayChargeCreateManyInput[] = [];
  const seen = new Set<string>();
  const perStay = new Map<string, number>();
  for (const t of T("HospedagemTarifa")) {
    const sid = String(t.HTa_idHospedagem);
    if (!stayIds.has(sid) || !t.HTa_DataIni) continue;
    const start = new Date(`${dayKey(t.HTa_DataIni)}T00:00:00Z`);
    let end = t.HTa_DataFim ? new Date(`${dayKey(t.HTa_DataFim)}T00:00:00Z`) : new Date(start.getTime() + 86400000);
    if (end <= start) end = new Date(start.getTime() + 86400000);
    for (let d = start; d < end; d = new Date(d.getTime() + 86400000)) {
      const dk = d.toISOString().slice(0, 10);
      const key = `${sid}|${dk}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const amount = num(t.HTa_VlrTarifa);
      perStay.set(sid, (perStay.get(sid) || 0) + amount);
      charges.push({ id: c.id("chg", `${t.HTa_ID}-${dk}`), stayCheckinId: c.id("hpd", sid), referenceDate: refDate(dk), description: tariffName.get(String(t.HTa_idTarifa)) || "Diária", chargeType: "DAILY", amount: new Prisma.Decimal(amount) });
    }
  }
  let cN = 0;
  await chunked(charges, 2000, async (p) => { cN += (await tx.stayCharge.createMany({ data: p, skipDuplicates: true })).count; });
  say(`Diárias lançadas: ${cN} novas (de ${charges.length} dias)`);
  const noCharge = stays.filter((s) => !perStay.has(String(s.id).split("-").pop()!)).length;
  const divergent = T("HospedagemNet").filter((h) => stayIds.has(String(h.Hpd_ID)) && perStay.has(String(h.Hpd_ID)) && Math.abs((perStay.get(String(h.Hpd_ID)) || 0) - num(h.Hpd_TotalBrtDiarias)) > 0.01).length;
  say(`  ℹ ${noCharge} hospedagens sem diárias detalhadas no legado (mantêm só o total); ${divergent} com soma das diárias ≠ total bruto do legado (total do legado preservado).`);

  // --- Demais hóspedes (HospedagemDmsHosp → StayGuest)
  const sg = T("HospedagemDmsHosp").filter((d) => stayIds.has(String(d.HD_IDHosped)) && str(d.HD_NomeHosp)).map((d) => ({ id: c.id("dms", d.HD_ID), stayCheckinId: c.id("hpd", d.HD_IDHosped), name: String(d.HD_NomeHosp).trim() }));
  say(`Hóspedes acompanhantes: ${(await tx.stayGuest.createMany({ data: sg, skipDuplicates: true })).count} novos (de ${T("HospedagemDmsHosp").length})`);

  // --- Consumo (ConsumoNetItens → StayConsumption). Itens de venda de balcão (sem hospedagem) ficam só no caixa.
  const header = new Map(T("ConsumoNet").map((h) => [String(h.Con_ID), h]));
  const cons: Prisma.StayConsumptionCreateManyInput[] = [];
  let noStay = 0;
  const consBy = new Map<string, number>();
  for (const i of T("ConsumoNetItens")) {
    const hid = i.ConI_IDHospedagem && i.ConI_IDHospedagem !== "0" ? String(i.ConI_IDHospedagem) : String(header.get(String(i.ConI_ConID))?.Con_IDHospedagem || "0");
    if (!stayIds.has(hid)) { noStay++; continue; }
    const op = operatorFor(acesso, i.ConI_IDUsuario);
    consBy.set(hid, (consBy.get(hid) || 0) + num(i.ConI_Total));
    cons.push({
      id: c.id("coni", i.ConI_ID), stayCheckinId: c.id("hpd", hid), productId: products.has(String(i.ConI_ProdID)) ? c.id("prod", i.ConI_ProdID) : null,
      productName: products.get(String(i.ConI_ProdID)) || `Produto ${i.ConI_ProdID}`, quantity: new Prisma.Decimal(num(i.ConI_Quant)),
      unitPrice: new Prisma.Decimal(num(i.ConI_VlrUnit)), totalPrice: new Prisma.Decimal(num(i.ConI_Total)),
      operatorId: op.id, operatorName: op.name, createdAt: dt(i.ConI_DtLancto) || undefined,
    });
  }
  let coN = 0;
  await chunked(cons, 1000, async (p) => { coN += (await tx.stayConsumption.createMany({ data: p, skipDuplicates: true })).count; });
  say(`Consumo lançado: ${coN} itens novos (de ${T("ConsumoNetItens").length}); ${noStay} itens sem hospedagem (vendas de balcão) não entram aqui`);
  const cdiv = T("HospedagemNet").filter((h) => stayIds.has(String(h.Hpd_ID)) && Math.abs((consBy.get(String(h.Hpd_ID)) || 0) - num(h.Hpd_TotalConsumo)) > 0.01).length;
  say(`  ℹ ${cdiv} hospedagens com soma dos itens ≠ total de consumo do legado (total do legado preservado).`);

  // --- Transferência de débito entre quartos (HospedagemOutDeb)
  const tr = T("HospedagemOutDeb").filter((t) => stayIds.has(String(t.HOD_idHosp_Ori)) && stayIds.has(String(t.HOD_idHosp_Des))).map((t) => {
    const op = operatorFor(acesso, t.HOD_idUsuario);
    return { id: c.id("hod", t.HOD_ID), tenantId, fromStayCheckinId: c.id("hpd", t.HOD_idHosp_Ori), toStayCheckinId: c.id("hpd", t.HOD_idHosp_Des), amount: new Prisma.Decimal(num(t.HOD_Valor)), operatorId: op.id, operatorName: op.name, createdAt: dt(t.HOD_Data) || undefined };
  });
  say(`Transferências de débito: ${(await tx.stayDebitTransfer.createMany({ data: tr, skipDuplicates: true })).count} novas (de ${T("HospedagemOutDeb").length})`);

  const obs = T("HospedagemObs").length;
  if (obs) say(`  ℹ ${obs} observações de hospedagem (HospedagemObs) não têm campo equivalente no SaaS e não foram importadas.`);
  say(`  ℹ ReservasDatas (${T("ReservasDatas").length}) é a grade de ocupação do mapa legado — o SaaS calcula isso a partir das hospedagens; ReservaNet está vazia. Nenhuma reserva a importar.`);
  say(`  ℹ HospedeNetMov (${T("HospedeNetMov").length}) é o extrato do hóspede por hospedagem, não saldo credor — não importado (evita saldos falsos; histórico já está nas hospedagens e pagamentos).`);

  // Quartos: a ocupação vem SOMENTE das hospedagens ativas (nenhuma foi importada como ativa),
  // então nenhum quarto importado pode ficar OCUPADO.
  const fixed = await tx.room.updateMany({ where: { tenantId, id: { startsWith: `hf${c.tenantId.replace(/-/g, "").slice(0, 8)}-apto-` }, status: "OCCUPIED" }, data: { status: "VACANT_CLEAN" } });
  say(`Quartos: ${fixed.count} que o legado marcava como ocupados voltaram para vago/limpo (sem hospedagem ativa importada).`);
}

// =====================================================================================
// FASE 5 — financeiro: caixas, lançamentos de caixa, contas a receber
// =====================================================================================
async function phase5(c: Ctx) {
  say("\n=== FASE 5 — financeiro ===");
  const { tx, tenantId } = c;
  const acesso = new Map(T("Acesso").map((a) => [String(a.Ace_ID), String(a.Ace_NomeUsuario).trim()]));
  const acessoByName = new Map(T("Acesso").map((a) => [norm(String(a.Ace_NomeUsuario)), String(a.Ace_ID)]));
  const formas = new Map(T("FormaPagt").map((f) => [String(f.ForPag_ID), String(f.ForPag_Nome).trim()]));
  const plcs = new Set(T("PLContas").map((p) => String(p.PLC_ID)));
  const stayRows = new Map(T("HospedagemNet").map((h) => [String(h.Hpd_ID), h]));
  const roomNo = new Map(T("Apartamentos").map((a) => [String(a.Ap_ID), String(a.Ap_NoAp).trim()]));
  const gName = new Map(T("HospedeNet").map((g) => [String(g.Hos_ID), String(g.Hos_Nome).trim()]));
  const stayOk = (id: string) => stayRows.has(id) && roomNo.has(String(stayRows.get(id)!.Hpd_IDQuarto)) && gName.has(String(stayRows.get(id)!.Hpd_IDHospPrinc));

  // reserva → hospedagem (só quando única; adiantamento de reserva sem hospedagem fica solto no caixa)
  const stayByRes = new Map<string, string[]>();
  for (const h of T("HospedagemNet")) if (h.Hpd_IDReserva && h.Hpd_IDReserva !== "0") stayByRes.set(String(h.Hpd_IDReserva), [...(stayByRes.get(String(h.Hpd_IDReserva)) || []), String(h.Hpd_ID)]);

  // --- Caixas (todos entram FECHADOS: o backup tem 6 "abertos" de fevereiro/2026)
  const registers = T("Caixa");
  const items = T("Caixa_Itens");
  const byChave = new Map(registers.map((r) => [String(r.ChaveCX), String(r.ID)]));
  const regIds = new Set(registers.map((r) => String(r.ID)));
  const sortedRegs = [...registers].sort((a, b) => String(a.DtHrAbe).localeCompare(String(b.DtHrAbe)));
  const resolveReg = (it: Row): string | null => {
    if (regIds.has(String(it.Cai_IDCaixa))) return String(it.Cai_IDCaixa);
    if (byChave.has(String(it.Cai_ChaveCx))) return byChave.get(String(it.Cai_ChaveCx))!;
    let best: string | null = null;
    for (const r of sortedRegs) if (String(r.DtHrAbe) <= String(it.Cai_Data)) best = String(r.ID);
    return best;
  };

  // lançamentos
  type Tx = Prisma.CashTransactionCreateManyInput & { _reg: string };
  const txs: Tx[] = [];
  let openingRows = 0, unlinkedStay = 0;
  const methodFromText = (it: Row) => {
    const t = `${it.Cai_Historico || ""} ${it.Cai_Descricao || ""}`.toUpperCase();
    for (const m of ["DINHEIRO", "PIX", "CARTAO", "CARTÃO", "FATURA", "TRANSF.DEBITO"]) if (t.includes(m)) return m.replace("Ã", "A");
    return null;
  };
  for (const it of items) {
    const valor = num(it.Cai_Valor);
    if (it.Cai_Descricao === "Abertura do caixa" && valor === 0) { openingRows++; continue; } // fundo de troco 0 = sem lançamento (convenção do SaaS)
    const reg = resolveReg(it);
    if (!reg) continue;
    const isFundo = it.Cai_Origem === "FUNDO DE CAIXA";
    let stay: string | null = null;
    if (it.Cai_Origem === "Hospedagem" && stayOk(String(it.Cai_IDOrigem))) stay = String(it.Cai_IDOrigem);
    else if (it.Cai_Origem === "Reserva") {
      const l = stayByRes.get(String(it.Cai_IDOrigem));
      if (l && l.length === 1 && stayOk(l[0])) stay = l[0];
    }
    if ((it.Cai_Origem === "Hospedagem" || it.Cai_Origem === "Reserva") && !stay) unlinkedStay++;
    const forma = String(it.Cai_idFormaPag);
    const methodName = isFundo ? "DINHEIRO" : formas.get(forma) || methodFromText(it) || (valor === 0 ? "SEM MOVIMENTO" : "NÃO INFORMADA");
    const sh = stay ? stayRows.get(stay)! : null;
    txs.push({
      _reg: reg, id: c.id("cai", it.Cai_ID), cashRegisterId: c.id("caixa", reg), type: isFundo ? "SUPRIMENTO" : "ENTRADA", amount: new Prisma.Decimal(valor),
      description: String(it.Cai_Descricao || it.Cai_Historico || "Lançamento importado do sistema legado").trim(), paymentMethod: methodName,
      countsInCashTotal: !!it.Cai_SomaCaixa, hiddenFromCashLog: forma === "6",
      stayCheckinId: stay ? c.id("hpd", stay) : null, roomNumber: sh ? roomNo.get(String(sh.Hpd_IDQuarto)) || null : null, guestName: sh ? gName.get(String(sh.Hpd_IDHospPrinc)) || null : null,
      accountPlanId: plcs.has(String(it.Cai_idPLC)) ? c.id("plc", it.Cai_idPLC) : null, createdAt: dt(it.Cai_Data) || undefined,
    });
  }

  const totals = new Map<string, number>();
  const lastAt = new Map<string, string>();
  for (const t of txs) {
    if (t.countsInCashTotal) totals.set(t._reg, (totals.get(t._reg) || 0) + Number(t.amount));
  }
  for (const it of items) { const r = resolveReg(it); if (r && String(it.Cai_Data) > (lastAt.get(r) || "")) lastAt.set(r, String(it.Cai_Data)); }
  const regRows: Prisma.CashRegisterCreateManyInput[] = registers.map((r) => {
    const name = String(r.NomeUsuario || "").trim() || "LEGADO";
    const aid = acessoByName.get(norm(name));
    return {
      id: c.id("caixa", r.ID), tenantId, operatorId: aid ? `hf-usuario-${aid}` : `hf-operador-${norm(name).replace(/ /g, "-")}`, operatorName: name,
      openingBalance: new Prisma.Decimal(0), closingBalance: new Prisma.Decimal(Math.round((totals.get(String(r.ID)) || 0) * 100) / 100),
      openedAt: dt(r.DtHrAbe)!, closedAt: dt(r.DtHrFec) || dt(lastAt.get(String(r.ID))) || dt(r.DtHrAbe)!, isOpen: false,
    };
  });
  say(`Caixas: ${(await tx.cashRegister.createMany({ data: regRows, skipDuplicates: true })).count} novos (de ${registers.length}); os ${registers.filter((r) => r.Aberto).length} que estavam abertos no backup entram FECHADOS`);

  const data = txs.map(({ _reg, ...rest }) => rest);
  let tN = 0;
  await chunked(data, 1000, async (p) => { tN += (await tx.cashTransaction.createMany({ data: p, skipDuplicates: true })).count; });
  say(`Lançamentos de caixa: ${tN} novos (de ${items.length}; ${openingRows} "Abertura do caixa" de valor zero não viram lançamento); ${unlinkedStay} de hospedagem/reserva sem hospedagem correspondente ficam soltos no caixa`);
  const sumLegacy = items.reduce((s, i) => s + (i.Cai_SomaCaixa ? num(i.Cai_Valor) : 0), 0);
  const sumNew = txs.reduce((s, t) => s + (t.countsInCashTotal ? Number(t.amount) : 0), 0);
  say(`  ✔ conciliação: total que soma no caixa — legado R$ ${sumLegacy.toFixed(2)} | importado R$ ${sumNew.toFixed(2)}`);

  // --- Contas a receber (ReceberNet). Exige hospedagem (FK obrigatória).
  const compByName = new Map(T("Empresas").map((e) => [norm(String(e.Emp_Razao)), String(e.Emp_ID)]));
  const recs: Prisma.AccountsReceivableCreateManyInput[] = [];
  let recNoStay = 0;
  for (const r of T("ReceberNet")) {
    const sid = String(r.Rec_DocOrigem);
    if (!stayOk(sid)) { recNoStay++; continue; }
    const cli = String(r.Rec_CodCliente);
    const nm = norm(String(r.Rec_NomCliente || ""));
    const guestMatch = gName.has(cli) && norm(gName.get(cli)!) === nm ? c.id("hosp", cli) : null;
    const comp = compByName.get(nm);
    recs.push({
      id: c.id("rec", r.Rec_ID), tenantId, stayCheckinId: c.id("hpd", sid), companyId: comp ? c.id("emp", comp) : null, guestId: guestMatch,
      billedToName: String(r.Rec_NomCliente || "").trim() || "—", documentNumber: String(r.Rec_NoDocumento || r.Rec_ID).trim(),
      issueDate: dt(r.Rec_Emissao) || new Date(), dueDate: dt(r.Rec_Vencimento) || dt(r.Rec_Emissao) || new Date(),
      amount: new Prisma.Decimal(num(r.Rec_Valor)), amountPaid: new Prisma.Decimal(num(r.Rec_ValorPago)), isPaid: !!r.Rec_Pago, paidAt: dt(r.Rec_DtPagto),
      paymentMethodDescription: "FATURA", notes: str(r.Rec_Obs),
    });
  }
  say(`Contas a receber: ${(await tx.accountsReceivable.createMany({ data: recs, skipDuplicates: true })).count} novas (de ${T("ReceberNet").length}); ${recNoStay} sem hospedagem correspondente não importadas; ${T("ReceberNet").filter((r) => !r.Rec_Pago).length} estavam em aberto no legado`);
}

// =====================================================================================
const PHASE_FNS: Record<string, (c: Ctx) => Promise<void>> = { "1": phase1, "2": phase2, "3": phase3, "4": phase4, "5": phase5 };

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
