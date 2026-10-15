-- Mercado Pago Checkout Pro records (D4, D5 of #177). Only provider ids, amounts and statuses are
-- stored: no card data, payer data, headers, signatures or provider payloads.
-- One row per Checkout Pro preference created for a registration.
CREATE TABLE "registration_checkouts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "registration_id" uuid NOT NULL,
  "mode" text NOT NULL,
  "preference_id" text NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "registration_checkouts_pk" PRIMARY KEY("id"),
  CONSTRAINT "registration_checkouts_preference_id_uq" UNIQUE("preference_id"),
  CONSTRAINT "registration_checkouts_mode_ck" CHECK ("mode" IN ('sandbox', 'production')),
  CONSTRAINT "registration_checkouts_amount_cents_ck" CHECK ("amount_cents" > 0),
  CONSTRAINT "registration_checkouts_currency_ck" CHECK ("currency" = 'MXN'),
  CONSTRAINT "registration_checkouts_registration_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."event_registrations"("id") ON DELETE no action ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX "registration_checkouts_registration_idx" ON "registration_checkouts" USING btree ("registration_id");--> statement-breakpoint
-- One row per Mercado Pago payment id; a preference can produce several (a rejected card, then a
-- retry). `status` keeps Mercado Pago's own vocabulary.
CREATE TABLE "registration_payments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "checkout_id" uuid NOT NULL,
  "provider_payment_id" text NOT NULL,
  "status" text NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "registration_payments_pk" PRIMARY KEY("id"),
  CONSTRAINT "registration_payments_provider_payment_id_uq" UNIQUE("provider_payment_id"),
  CONSTRAINT "registration_payments_status_ck" CHECK ("status" IN ('pending', 'approved', 'authorized', 'in_process', 'in_mediation', 'rejected', 'cancelled', 'refunded', 'charged_back')),
  CONSTRAINT "registration_payments_amount_cents_ck" CHECK ("amount_cents" > 0),
  CONSTRAINT "registration_payments_currency_ck" CHECK ("currency" = 'MXN'),
  CONSTRAINT "registration_payments_checkout_fk" FOREIGN KEY ("checkout_id") REFERENCES "public"."registration_checkouts"("id") ON DELETE no action ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX "registration_payments_checkout_idx" ON "registration_payments" USING btree ("checkout_id");--> statement-breakpoint
-- Idempotency log: each webhook notification id is processed once. `outcome` is a short code.
CREATE TABLE "payment_webhook_notifications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "notification_id" text NOT NULL,
  "provider_payment_id" text NOT NULL,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone,
  "outcome" text,
  CONSTRAINT "payment_webhook_notifications_pk" PRIMARY KEY("id"),
  CONSTRAINT "payment_webhook_notifications_notification_id_uq" UNIQUE("notification_id"),
  CONSTRAINT "payment_webhook_notifications_outcome_ck" CHECK ("outcome" IS NULL OR length("outcome") <= 64)
);
