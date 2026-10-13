CREATE TYPE "public"."boot_step_status" AS ENUM('pending', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner');--> statement-breakpoint
CREATE TABLE "boot_step" (
	"id" text PRIMARY KEY NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"status" "boot_step_status" DEFAULT 'pending' NOT NULL,
	"version" text NOT NULL,
	"message" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "site" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"title" text NOT NULL,
	"handle" text NOT NULL,
	"default_translation_id" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_single_row" CHECK ("site"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'owner' NOT NULL,
	"session_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_token" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_token_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "site" ADD CONSTRAINT "site_default_translation_id_translation_id_fk" FOREIGN KEY ("default_translation_id") REFERENCES "public"."translation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_single_owner_idx" ON "user" USING btree ("role") WHERE "user"."role" = 'owner';