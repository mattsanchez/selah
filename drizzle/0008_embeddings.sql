CREATE TABLE "embedding_job" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"status" "boot_step_status" NOT NULL,
	"model" text NOT NULL,
	"done" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"message" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	CONSTRAINT "embedding_job_single_row" CHECK ("embedding_job"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "item_embedding" (
	"item_id" uuid NOT NULL,
	"model" text NOT NULL,
	"text_hash" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	CONSTRAINT "item_embedding_item_id_model_pk" PRIMARY KEY("item_id","model")
);
--> statement-breakpoint
CREATE TABLE "passage_embedding" (
	"model" text NOT NULL,
	"translation_id" text NOT NULL,
	"verse_start" integer NOT NULL,
	"verse_end" integer NOT NULL,
	"text_hash" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	CONSTRAINT "passage_embedding_model_translation_id_verse_start_verse_end_pk" PRIMARY KEY("model","translation_id","verse_start","verse_end"),
	CONSTRAINT "passage_embedding_range" CHECK ("passage_embedding"."verse_start" <= "passage_embedding"."verse_end")
);
--> statement-breakpoint
ALTER TABLE "item" ADD COLUMN "search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english'::regconfig, coalesce("title", '')), 'A') || setweight(to_tsvector('english'::regconfig, coalesce("note", '') || ' ' || coalesce("markdown", '')), 'B')) STORED;--> statement-breakpoint
ALTER TABLE "item_embedding" ADD CONSTRAINT "item_embedding_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passage_embedding" ADD CONSTRAINT "passage_embedding_translation_id_translation_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."translation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "passage_embedding_vector_idx" ON "passage_embedding" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "item_search_idx" ON "item" USING gin ("search");