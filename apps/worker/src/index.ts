import "dotenv/config";
import cron from "node-cron";
import { runDailyRollover } from "./rollover";
import { runOccupancySnapshot } from "./occupancySnapshot";
import { runCheckoutPrevision } from "./checkoutPrevision";
import { runPreCheckinFnrh } from "./preCheckinFnrh";
import { runSnrhosTransmit } from "./snrhosTransmit";
import { runOperationalAgent } from "./operationalAgent";
import { runWaitlistAgent } from "./waitlistAgent";
import { runSaasDunning } from "./saasDunning";
import { runSaasMonitor } from "./saasMonitor";
import { runNoShowSweep } from "./noShowSweep";
import { runReviewsSync } from "./reviewsSync";
import { runReviewFeedbackFunnel } from "./reviewFeedbackFunnel";
import { runMaintenanceNotify, runMaintenanceReminders } from "./maintenanceNotify";

console.log("[worker] Virada de diária — worker iniciado.");

cron.schedule("* * * * *", () => {
  runDailyRollover().catch((err) => {
    console.error("[worker] Erro ao rodar virada de diária:", err);
  });
});

cron.schedule("0 * * * *", () => {
  runOccupancySnapshot().catch((err) => {
    console.error("[worker] Erro ao gravar snapshot de ocupação:", err);
  });
});

cron.schedule("* * * * *", () => {
  runCheckoutPrevision().catch((err) => {
    console.error("[worker] Erro ao rodar aviso de previsão de checkout:", err);
  });
});

cron.schedule("* * * * *", () => {
  runPreCheckinFnrh().catch((err) => {
    console.error("[worker] Erro ao rodar envio de pré-check-in FNRH:", err);
  });
});

// Aviso de OS de manutenção ao colaborador por WhatsApp — a cada minuto, para o técnico saber do
// problema logo depois que a recepção abre (ou reatribui) a OS. Ver maintenanceNotify.ts.
cron.schedule("* * * * *", () => {
  runMaintenanceNotify().catch((err) => {
    console.error("[worker] Erro ao enviar avisos de manutenção:", err);
  });
});

// Lembretes ao colaborador de manutenção (OS sem início, previsão vencida) — uma vez por situação.
cron.schedule("*/10 * * * *", () => {
  runMaintenanceReminders().catch((err) => {
    console.error("[worker] Erro ao enviar lembretes de manutenção:", err);
  });
});

cron.schedule("*/5 * * * *", () => {
  runSnrhosTransmit().catch((err) => {
    console.error("[worker] Erro ao rodar transmissão ao SNRHos:", err);
  });
});

cron.schedule("*/15 * * * *", () => {
  runOperationalAgent().catch((err) => {
    console.error("[worker] Erro ao rodar agente operacional:", err);
  });
});

// Fila de espera — reavalia a fila de cada tenant e avisa o primeiro quando abre uma vaga da mesma
// categoria no período. 10 min é frescor de sobra (a Fase 3 adiciona reavaliação imediata nos
// pontos de cancelamento/check-out).
cron.schedule("*/10 * * * *", () => {
  runWaitlistAgent().catch((err) => {
    console.error("[worker] Erro ao rodar agente da fila de espera:", err);
  });
});

// Régua de inadimplência do SaaS — 1x por hora é frequência de sobra para thresholds de 15/30 dias.
cron.schedule("7 * * * *", () => {
  runSaasDunning().catch((err) => {
    console.error("[worker] Erro ao rodar régua de inadimplência:", err);
  });
});

// Monitor da plataforma (cota de IA estourada por assinante etc.) — 1x por hora.
cron.schedule("12 * * * *", () => {
  runSaasMonitor().catch((err) => {
    console.error("[worker] Erro ao rodar monitor da plataforma:", err);
  });
});

// Rotina de no-show — marca NO_SHOW as reservas cujo dia de chegada terminou sem check-in,
// liberando o quarto. Determinística (sem LLM). 1x por hora é frequência de sobra.
cron.schedule("17 * * * *", () => {
  runNoShowSweep().catch((err) => {
    console.error("[worker] Erro ao rodar rotina de no-show:", err);
  });
});

// Monitoramento de reviews (Google Maps, TripAdvisor, Booking, Facebook, Instagram, Reclame Aqui).
// O cron dispara a cada 30min só para não deixar um conector devido esperando demais; a cadência
// real de coleta é 2x ao dia por conector (pedido explícito do assinante), imposta por
// MIN_SYNC_INTERVAL_MINUTES dentro de reviewsSync.ts, não por este intervalo do cron.
cron.schedule("*/30 * * * *", () => {
  runReviewsSync().catch((err) => {
    console.error("[worker] Erro ao rodar sincronização de reviews:", err);
  });
});

// Funil de satisfação pós-checkout — dispara horas depois do check-out efetivo, não precisa de
// frescor de minuto a minuto. 15 min é suficiente pra não atrasar demais o envio.
cron.schedule("*/15 * * * *", () => {
  runReviewFeedbackFunnel().catch((err) => {
    console.error("[worker] Erro ao rodar funil de satisfação pós-checkout:", err);
  });
});
