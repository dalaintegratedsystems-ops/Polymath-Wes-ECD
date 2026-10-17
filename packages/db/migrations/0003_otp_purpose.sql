ALTER TABLE "otp_challenges" ADD COLUMN "purpose" text DEFAULT 'sign_in' NOT NULL;--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD COLUMN "subject_id" uuid;