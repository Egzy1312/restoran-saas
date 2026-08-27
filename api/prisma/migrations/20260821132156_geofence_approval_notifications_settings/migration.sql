-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "confirmation_sent_at" TIMESTAMP(3),
ADD COLUMN     "reminder_sent_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "allowed_ip" VARCHAR(45),
ADD COLUMN     "geofence_radius_meters" INTEGER,
ADD COLUMN     "require_order_approval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripe_secret_key" TEXT,
ADD COLUMN     "twilio_account_sid" TEXT,
ADD COLUMN     "twilio_auth_token" TEXT,
ADD COLUMN     "twilio_from_number" TEXT;
