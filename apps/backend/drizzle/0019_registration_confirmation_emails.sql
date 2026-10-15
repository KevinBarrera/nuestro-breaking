-- Transactional outbox for confirmation emails (D2, D3 of #179). The payment webhook queues one row
-- per registration in its confirmation transaction; the dispatcher sends it after commit. Only
-- delivery state is stored: no addresses, names or message bodies.
CREATE TABLE "registration_confirmation_emails" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "registration_id" uuid NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_error_code" text,
  "provider_message_id" text,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "registration_confirmation_emails_pk" PRIMARY KEY("id"),
  CONSTRAINT "registration_confirmation_emails_registration_id_uq" UNIQUE("registration_id"),
  CONSTRAINT "registration_confirmation_emails_status_ck" CHECK ("status" IN ('pending', 'sent', 'failed')),
  CONSTRAINT "registration_confirmation_emails_attempts_ck" CHECK ("attempts" >= 0),
  CONSTRAINT "registration_confirmation_emails_last_error_code_ck" CHECK ("last_error_code" IS NULL OR length("last_error_code") <= 64),
  CONSTRAINT "registration_confirmation_emails_registration_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."event_registrations"("id") ON DELETE no action ON UPDATE no action
);--> statement-breakpoint
-- The dispatcher sweep reads due rows by status and time.
CREATE INDEX "registration_confirmation_emails_due_idx" ON "registration_confirmation_emails" USING btree ("status","next_attempt_at");
