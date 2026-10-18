CREATE TABLE "channel_inbound" (
	"provider_message_id" text PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
