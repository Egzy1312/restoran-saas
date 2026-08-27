-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "customer_name" TEXT,
ADD COLUMN     "customer_phone" TEXT,
ADD COLUMN     "pickup_time" TIMESTAMP(3);
