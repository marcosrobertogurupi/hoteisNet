/**
 * Utilitário para cálculo e validação da tolerância de expiração/queda de reservas por assinante.
 */

export interface ReservationToleranceParams {
  checkInDate: string; // Formato YYYY-MM-DD
  checkInTime?: string | null; // Formato HH:mm (opcional)
  defaultCheckInTime?: string; // Formato HH:mm fallback (padrão: "14:00")
  toleranceHours: number; // Tolerância em horas (ex: 2, 24)
  status?: string; // Status da reserva
}

/**
 * Retorna o objeto Date contendo a data e hora exata em que a reserva expira (cai).
 */
export function getReservationExpirationDate({
  checkInDate,
  checkInTime,
  defaultCheckInTime = "14:00",
  toleranceHours,
}: ReservationToleranceParams): Date | null {
  if (!checkInDate) return null;

  const timeStr = (checkInTime && checkInTime.trim()) ? checkInTime.trim() : defaultCheckInTime;
  
  // Garantir formato YYYY-MM-DDTHH:mm:00
  const dateTimeIso = `${checkInDate}T${timeStr.length === 5 ? timeStr : "14:00"}:00`;
  const checkInDateTime = new Date(dateTimeIso);

  if (isNaN(checkInDateTime.getTime())) return null;

  // Soma as horas de tolerância
  const expirationMs = checkInDateTime.getTime() + toleranceHours * 60 * 60 * 1000;
  return new Date(expirationMs);
}

/**
 * Verifica se a reserva está expirada (caiu por ultrapassar as horas de tolerância).
 * Reservas com status "CHECKED_IN" (hóspede presente) NUNCA expiram por essa regra.
 */
export function isReservationExpired(
  params: ReservationToleranceParams,
  nowDate: Date = new Date()
): boolean {
  // Se o hóspede já fez check-in, a reserva não cai
  if (params.status === "CHECKED_IN") {
    return false;
  }

  const expirationDate = getReservationExpirationDate(params);
  if (!expirationDate) return false;

  // Se a data/hora atual for maior ou igual à data/hora de expiração, a reserva caiu
  return nowDate.getTime() >= expirationDate.getTime();
}

/**
 * Formata o momento limite de tolerância para exibição amigável ao usuário.
 */
export function formatExpirationLimit(
  expirationDate: Date | null
): string {
  if (!expirationDate) return "";

  const day = String(expirationDate.getDate()).padStart(2, "0");
  const month = String(expirationDate.getMonth() + 1).padStart(2, "0");
  const year = expirationDate.getFullYear();
  const hours = String(expirationDate.getHours()).padStart(2, "0");
  const minutes = String(expirationDate.getMinutes()).padStart(2, "0");

  return `${day}/${month}/${year} às ${hours}:${minutes}:00`;
}
