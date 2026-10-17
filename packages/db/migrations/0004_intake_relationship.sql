ALTER TABLE "child_intakes" ALTER COLUMN "child_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "child_intakes" ADD COLUMN "guardian_relationship" text DEFAULT 'guardian' NOT NULL;