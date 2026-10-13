CREATE TYPE "public"."commentary_kind" AS ENUM('commentary', 'study_notes');--> statement-breakpoint
CREATE TABLE "commentary_entry" (
	"source_id" text NOT NULL,
	"verse_start" integer NOT NULL,
	"verse_end" integer NOT NULL,
	"html" text NOT NULL,
	CONSTRAINT "commentary_entry_source_id_verse_start_verse_end_pk" PRIMARY KEY("source_id","verse_start","verse_end")
);
--> statement-breakpoint
CREATE TABLE "commentary_source" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "commentary_kind" NOT NULL,
	"license" text NOT NULL,
	"attribution" text NOT NULL,
	"source_url" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cross_ref" (
	"from_verse" integer NOT NULL,
	"to_start" integer NOT NULL,
	"to_end" integer NOT NULL,
	"votes" integer NOT NULL,
	CONSTRAINT "cross_ref_from_verse_to_start_to_end_pk" PRIMARY KEY("from_verse","to_start","to_end")
);
--> statement-breakpoint
ALTER TABLE "commentary_entry" ADD CONSTRAINT "commentary_entry_source_id_commentary_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."commentary_source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commentary_entry_verse_start_idx" ON "commentary_entry" USING btree ("verse_start");