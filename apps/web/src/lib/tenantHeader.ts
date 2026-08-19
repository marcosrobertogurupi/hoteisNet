import { prisma } from "@/lib/prisma";

export interface TenantHeaderInfo {
  name: string;
  cnpj: string;
  addressLine: string;
}

// Monta o cabeçalho impresso (nome do hotel, CNPJ, endereço) a partir dos dados reais do Tenant
// cadastrados em Configurações — usado por todos os relatórios do assinante, em vez dos dados fixos
// de demonstração ("HOTEL IDEAL...") que os modais de impressão legados ainda usam como fallback.
export async function getTenantHeaderInfo(tenantId: string): Promise<TenantHeaderInfo> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      name: true,
      tradeName: true,
      cnpj: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
      phone: true,
    },
  });

  if (!tenant) {
    return { name: "", cnpj: "", addressLine: "" };
  }

  const locationParts = [tenant.address, tenant.city, tenant.state].filter(Boolean);
  let addressLine = locationParts.join(" - ");
  if (tenant.zipCode) addressLine += `${addressLine ? " " : ""}CEP: ${tenant.zipCode}`;
  if (tenant.phone) addressLine += `${addressLine ? " - " : ""}${tenant.phone}`;

  return {
    // O nome oficial do estabelecimento (razão social) é o dado real do assinante — a tradeName
    // hoje só existe como texto de demonstração ("Hoteis.Net PMS SaaS Demo") preenchido na
    // provisão do tenant de testes, então é usada apenas como último recurso se o nome faltar.
    name: tenant.name || tenant.tradeName || "",
    cnpj: formatCnpj(tenant.cnpj),
    addressLine,
  };
}

function formatCnpj(cnpj: string | null): string {
  if (!cnpj) return "";
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) return cnpj;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}
