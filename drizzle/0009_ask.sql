CREATE TABLE "ask_answer" (
	"key" text PRIMARY KEY NOT NULL,
	"passage" text NOT NULL,
	"translation_id" text NOT NULL,
	"question" text NOT NULL,
	"model" text NOT NULL,
	"answer" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ask_usage" (
	"day" date PRIMARY KEY NOT NULL,
	"questions" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ask_usage_not_negative" CHECK ("ask_usage"."questions" >= 0)
);
