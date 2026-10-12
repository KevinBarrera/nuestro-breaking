-- Admin team management (#214 D3, D4). Invitations are one-time activation links: only the SHA-256
-- digest of the token is stored, never the token. A user has at most one open invitation.
CREATE TABLE "admin_invitations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "token_digest" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "created_by_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "admin_invitations_pk" PRIMARY KEY("id"),
  CONSTRAINT "admin_invitations_token_digest_uq" UNIQUE("token_digest"),
  CONSTRAINT "admin_invitations_token_digest_ck" CHECK ("token_digest" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "admin_invitations_state_ck" CHECK ("used_at" IS NULL OR "cancelled_at" IS NULL),
  CONSTRAINT "admin_invitations_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "admin_invitations_created_by_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX "admin_invitations_open_user_uq" ON "admin_invitations" USING btree ("user_id") WHERE "used_at" IS NULL AND "cancelled_at" IS NULL;--> statement-breakpoint
-- Team audit: who did what to whom. Admin actions carry the actor user and session. `bootstrapped`
-- comes from the hosted command and has no actor; `activated` is done by the invitee, who has no
-- session yet, so the actor is the target user.
CREATE TABLE "admin_team_audit" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "action" text NOT NULL,
  "actor_user_id" uuid,
  "actor_session_id" uuid,
  "target_user_id" uuid NOT NULL,
  "reason" text,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "admin_team_audit_pk" PRIMARY KEY("id"),
  CONSTRAINT "admin_team_audit_action_ck" CHECK ("action" IN ('invited', 'invitation_regenerated', 'invitation_cancelled', 'activated', 'scope_changed', 'deactivated', 'reactivated', 'bootstrapped')),
  CONSTRAINT "admin_team_audit_actor_ck" CHECK (CASE "action" WHEN 'bootstrapped' THEN "actor_user_id" IS NULL AND "actor_session_id" IS NULL WHEN 'activated' THEN "actor_user_id" IS NOT NULL AND "actor_user_id" = "target_user_id" AND "actor_session_id" IS NULL ELSE "actor_user_id" IS NOT NULL AND "actor_session_id" IS NOT NULL END),
  CONSTRAINT "admin_team_audit_actor_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "admin_team_audit_session_fk" FOREIGN KEY ("actor_session_id") REFERENCES "public"."auth_sessions"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "admin_team_audit_target_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
);--> statement-breakpoint
-- The team page reads a member's history newest first.
CREATE INDEX "admin_team_audit_target_created_idx" ON "admin_team_audit" USING btree ("target_user_id","created_at");
