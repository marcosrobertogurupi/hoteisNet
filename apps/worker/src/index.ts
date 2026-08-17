import "dotenv/config";
import cron from "node-cron";
import { runDailyRollover } from "./rollover";
import { runOccupancySnapshot } from "./occupancySnapshot";

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
