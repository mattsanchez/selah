CREATE TYPE "public"."item_kind" AS ENUM('highlight', 'reflection', 'note');--> statement-breakpoint
CREATE TYPE "public"."item_visibility" AS ENUM('private', 'unlisted', 'public');--> statement-breakpoint
CREATE TABLE "item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" "item_kind" NOT NULL,
	"markdown" text,
	"note" text,
	"color" text,
	"visibility" "item_visibility" DEFAULT 'private' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_highlight_has_color" CHECK ("item"."kind" <> 'highlight' or "item"."color" is not null)
);
--> statement-breakpoint
CREATE TABLE "item_passage" (
	"item_id" uuid NOT NULL,
	"verse_start" integer NOT NULL,
	"verse_end" integer NOT NULL,
	"translation_id" text,
	CONSTRAINT "item_passage_item_id_verse_start_verse_end_pk" PRIMARY KEY("item_id","verse_start","verse_end"),
	CONSTRAINT "item_passage_range" CHECK ("item_passage"."verse_start" <= "item_passage"."verse_end")
);
--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_passage" ADD CONSTRAINT "item_passage_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_passage" ADD CONSTRAINT "item_passage_translation_id_translation_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."translation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_owner_kind_created_idx" ON "item" USING btree ("owner_id","kind","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "item_passage_range_idx" ON "item_passage" USING gist (int4range("verse_start", "verse_end", '[]'));