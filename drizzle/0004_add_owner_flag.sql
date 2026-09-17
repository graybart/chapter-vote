ALTER TABLE "admins" ADD COLUMN "is_owner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "admins" SET "is_owner" = true WHERE "id" = (SELECT "id" FROM "admins" WHERE "role" = 'admin' ORDER BY "created_at" ASC LIMIT 1);
