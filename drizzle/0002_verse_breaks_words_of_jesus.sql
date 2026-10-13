ALTER TABLE "verse" ADD COLUMN "breaks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "verse" ADD COLUMN "words_of_jesus" jsonb DEFAULT '[]'::jsonb NOT NULL;