import "dotenv/config";
import cron from "node-cron";
import { runDailyRollover } from "./rollover";
import { runOccupancySnapshot } from "./occupancySnapshot";
import { runCheckoutPrevision } from "./checkoutPrevision";
import { runPreCheckinFnrh } from "./preCheckinFnrh";
import { runSnrhosTransmit } from "./snrhosTransmit";
import { runOperationalAgent } from "./operationalAgent";
import { runSaasDunning } from "./saasDunning";
import { runSaasMonitor } from "./saasMonitor";

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
