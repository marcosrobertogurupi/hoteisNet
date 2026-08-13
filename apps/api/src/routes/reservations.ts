import { FastifyInstance } from "fastify";

export async function reservationRoutes(server: FastifyInstance) {
  // List Tenant Reservations
  server.get("/api/reservations", async () => {
    return {
      success: true,
      reservations: [
        {
          id: "RES-4092",
          guestName: "Carlos Eduardo Silva",
          cpf: "123.456.789-00",
          phone: "(11) 98765-4321",
          roomNumber: "102",
          roomCategory: "Suíte Luxo Mar",
          checkInDate: "2026-08-15",
          checkOutDate: "2026-08-18",
          totalAmount: 1050.00,
          depositPaid: 350.00,
          status: "CONFIRMED",
          precheckinSent: true,
          corporateCompany: "Meta Consultoria LTDA",
        },
        {
          id: "RES-4091",
          guestName: "Juliana Andrade",
          cpf: "987.654.321-11",
          phone: "(21) 99887-6655",
          roomNumber: "202",
          roomCategory: "Master Família",
          checkInDate: "2026-08-20",
          checkOutDate: "2026-08-25",
          totalAmount: 2450.00,
          depositPaid: 500.00,
          status: "PRE_RESERVATION",
          precheckinSent: false,
          corporateCompany: null,
        },
      ],
    };
  });

  // Create Reservation & Dispatch Uazapi Pre-checkin Link
  server.post("/api/reservations", async (request, reply) => {
    const body = request.body as any;
    const resId = `RES-${Math.floor(4000 + Math.random() * 900)}`;

    return reply.status(201).send({
      success: true,
      reservationId: resId,
      precheckinLink: `https://app.hoteisnet.com/self-checkin/${resId}`,
      uazapiStatus: "DISPATCHED_TO_WHATSAPP",
      message: "Reserva criada e link de pré-checkin FNRH enviado ao WhatsApp do hóspede!",
    });
  });
}
