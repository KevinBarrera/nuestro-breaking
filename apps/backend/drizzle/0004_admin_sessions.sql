ALTER TABLE "users" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_password_hash_ck" CHECK ("password_hash" IS NULL OR "password_hash" LIKE '$argon2id$%');--> statement-breakpoint
CREATE TABLE "user_roles" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "role" text NOT NULL,
  "scope_type" text DEFAULT 'global' NOT NULL,
  "scope_id" uuid,
  "active" boolean DEFAULT true NOT NULL,
  "approved_at" timestamptz DEFAULT now() NOT NULL,
  "revoked_at" timestamptz,
  CONSTRAINT "user_roles_role_ck" CHECK ("role" IN ('admin', 'judge', 'dancer')),
  CONSTRAINT "user_roles_scope_ck" CHECK ("scope_type" IN ('global', 'organization', 'event')),
  CONSTRAINT "user_roles_lifecycle_ck" CHECK (("active" = true AND "revoked_at" IS NULL) OR ("active" = false))
);--> statement-breakpoint
CREATE TABLE "auth_sessions" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "token_digest" text NOT NULL UNIQUE,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz
);--> statement-breakpoint
CREATE TABLE "auth_audit" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "action" text NOT NULL CHECK ("action" IN ('session_created', 'denied', 'session_revoked')),
  "user_id" uuid REFERENCES "users"("id"),
  "session_id" uuid REFERENCES "auth_sessions"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL
);
