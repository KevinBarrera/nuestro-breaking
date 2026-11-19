-- Online service charge per checkout (#239): the part of `amount_cents` that passes the Mercado
-- Pago fee on to the buyer. Checkouts created before it have no charge, so existing rows get 0.
ALTER TABLE "registration_checkouts" ADD COLUMN "service_charge_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "registration_checkouts" ADD CONSTRAINT "registration_checkouts_service_charge_cents_ck" CHECK ("service_charge_cents" >= 0 AND "service_charge_cents" < "amount_cents");
