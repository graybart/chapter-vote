CREATE TYPE "public"."voting_method" AS ENUM('ranked', 'single');--> statement-breakpoint
ALTER TABLE "contests" ADD COLUMN "method" "voting_method" DEFAULT 'ranked' NOT NULL;