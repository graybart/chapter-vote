ALTER TABLE "contest_results" ADD COLUMN "winners" jsonb;--> statement-breakpoint
ALTER TABLE "contests" ADD COLUMN "seats" integer DEFAULT 1 NOT NULL;