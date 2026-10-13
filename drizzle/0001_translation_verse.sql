CREATE TYPE "public"."translation_provider" AS ENUM('local', 'api');--> statement-breakpoint
CREATE TABLE "translation" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"abbrev" text NOT NULL,
	"license" text NOT NULL,
	"attribution" text NOT NULL,
	"source_url" text NOT NULL,
	"provider" "translation_provider" DEFAULT 'local' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verse" (
	"translation_id" text NOT NULL,
	"verse_id" integer NOT NULL,
	"text" text NOT NULL,
	"headings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"footnotes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "verse_translation_id_verse_id_pk" PRIMARY KEY("translation_id","verse_id")
);
--> statement-breakpoint
ALTER TABLE "verse" ADD CONSTRAINT "verse_translation_id_translation_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."translation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "verse_verse_id_idx" ON "verse" USING btree ("verse_id");