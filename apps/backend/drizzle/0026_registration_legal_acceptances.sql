-- Legal acceptance per registration (#180): the document key, the version the buyer accepted and
-- when. Append-only: a reused pending registration gets new rows and earlier rows stay as they were.
CREATE TABLE "registration_legal_acceptances" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "registration_id" uuid NOT NULL,
  "document_key" text NOT NULL,
  "document_version" text NOT NULL,
  "accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "registration_legal_acceptances_pk" PRIMARY KEY("id"),
  CONSTRAINT "registration_legal_acceptances_document_key_ck" CHECK ("document_key" IN ('rules', 'privacy', 'cancellation')),
  CONSTRAINT "registration_legal_acceptances_document_version_ck" CHECK (length("document_version") BETWEEN 1 AND 64),
  CONSTRAINT "registration_legal_acceptances_registration_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."event_registrations"("id") ON DELETE no action ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX "registration_legal_acceptances_registration_idx" ON "registration_legal_acceptances" USING btree ("registration_id");
