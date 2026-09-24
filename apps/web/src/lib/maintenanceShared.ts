// Rótulos e formatação da OS de manutenção — sem Prisma, para servir tanto às rotas quanto às
// telas (Mapa de Quartos, "Ver OS", app /manutencao). As regras ficam em lib/maintenance.ts.

export type MaintenanceStageValue = "OPEN" | "EVALUATING" | "WAITING" | "RESOLVED" | "CANCELLED";

export const MAINTENANCE_STAGE_LABEL: Record<MaintenanceStageValue, string> = {
  OPEN: "Entrada em manutenção",
  EVALUATING: "Avaliando",
  WAITING: "Aguardando",
  RESOLVED: "Resolvido",
  CANCELLED: "Cancelada",
};

// As 4 etapas do funil, na ordem (cancelada fica fora — é saída lateral).
export const MAINTENANCE_FUNNEL: MaintenanceStageValue[] = ["OPEN", "EVALUATING", "WAITING", "RESOLVED"];

// Duração legível de um intervalo em ms: "2d 4h", "3h 20min", "15min".
export function formatMaintenanceDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const minutes = totalMin % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
  return `${minutes}min`;
}

// Data/hora no relógio de Brasília: "24/09 14:32" (ou com ano, se pedido).
export function formatMaintenanceDateTime(value: string | Date | null | undefined, withYear = false): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    ...(withYear ? { year: "numeric" as const } : {}),
    hour: "2-digit",
    minute: "2-digit",
  });
}
