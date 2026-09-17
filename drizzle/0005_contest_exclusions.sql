CREATE TABLE "contest_exclusions" (
	"contest_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contest_exclusions_contest_id_member_id_pk" PRIMARY KEY("contest_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "contest_exclusions" ADD CONSTRAINT "contest_exclusions_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_exclusions" ADD CONSTRAINT "contest_exclusions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;