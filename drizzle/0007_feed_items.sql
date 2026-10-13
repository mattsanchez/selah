CREATE TABLE "item_tag" (
	"item_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "item_tag_item_id_tag_id_pk" PRIMARY KEY("item_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "item" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "item_tag" ADD CONSTRAINT "item_tag_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_tag" ADD CONSTRAINT "item_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_tag_tag_idx" ON "item_tag" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tag_owner_slug_idx" ON "tag" USING btree ("owner_id","slug");--> statement-breakpoint
-- Written by hand: rows from before the two columns were kept in step.
UPDATE "item" SET "published_at" = NULL WHERE "visibility" = 'private' AND "published_at" IS NOT NULL;--> statement-breakpoint
UPDATE "item" SET "published_at" = "created_at" WHERE "visibility" <> 'private' AND "published_at" IS NULL;--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_published_unless_private" CHECK (("item"."visibility" = 'private') = ("item"."published_at" is null));