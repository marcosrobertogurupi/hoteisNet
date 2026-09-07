-- Recurso "Quarto abastecido" (frigobar / kit do quarto).
--
-- Cria o pré-cadastro do kit por categoria (stocked_room_kit_items) e o histórico de conferências
-- do frigobar (room_minibar_checks / room_minibar_check_items), além dos campos de configuração no
-- tenant (stockedRoomEnabled / stockedRoomPosLocationId).
--
-- RLS é habilitado nas 3 tabelas novas SEM nenhuma policy (RLS ligado + zero policies = negação
-- total para anon/authenticated do PostgREST; o Prisma usa o papel dono e não é afetado). Mesmo
-- motivo das migrations 20260823220000 / 20260905000000 — ver CLAUDE.md §11.

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "stockedRoomEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stockedRoomPosLocationId" TEXT;

-- CreateTable
CREATE TABLE "stocked_room_kit_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roomCategoryId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "parQuantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stocked_room_kit_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_minibar_checks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "stayCheckinId" TEXT,
    "housekeepingTaskId" TEXT,
    "source" TEXT NOT NULL,
    "performedByType" TEXT NOT NULL,
    "performedById" TEXT,
    "performedByName" TEXT,
    "totalSold" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_minibar_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_minibar_check_items" (
    "id" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "parQuantity" INTEGER NOT NULL,
    "foundQuantity" INTEGER NOT NULL,
    "soldQuantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "stayConsumptionId" TEXT,

    CONSTRAINT "room_minibar_check_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stocked_room_kit_items_tenantId_idx" ON "stocked_room_kit_items"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "stocked_room_kit_items_roomCategoryId_productId_key" ON "stocked_room_kit_items"("roomCategoryId", "productId");

-- CreateIndex
CREATE INDEX "room_minibar_checks_tenantId_roomId_idx" ON "room_minibar_checks"("tenantId", "roomId");

-- CreateIndex
CREATE INDEX "room_minibar_checks_stayCheckinId_idx" ON "room_minibar_checks"("stayCheckinId");

-- CreateIndex
CREATE INDEX "room_minibar_check_items_checkId_idx" ON "room_minibar_check_items"("checkId");

-- AddForeignKey
ALTER TABLE "stocked_room_kit_items" ADD CONSTRAINT "stocked_room_kit_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocked_room_kit_items" ADD CONSTRAINT "stocked_room_kit_items_roomCategoryId_fkey" FOREIGN KEY ("roomCategoryId") REFERENCES "room_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocked_room_kit_items" ADD CONSTRAINT "stocked_room_kit_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_minibar_checks" ADD CONSTRAINT "room_minibar_checks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_minibar_checks" ADD CONSTRAINT "room_minibar_checks_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_minibar_checks" ADD CONSTRAINT "room_minibar_checks_stayCheckinId_fkey" FOREIGN KEY ("stayCheckinId") REFERENCES "stay_checkins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_minibar_check_items" ADD CONSTRAINT "room_minibar_check_items_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "room_minibar_checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_minibar_check_items" ADD CONSTRAINT "room_minibar_check_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row Level Security (negação total para anon/authenticated — ver cabeçalho)
ALTER TABLE "stocked_room_kit_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "room_minibar_checks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "room_minibar_check_items" ENABLE ROW LEVEL SECURITY;
