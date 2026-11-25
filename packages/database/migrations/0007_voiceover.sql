CREATE TYPE "public"."audio_track_status" AS ENUM('GENERATING', 'READY', 'APPROVED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "audio_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"asset_id" uuid,
	"status" "audio_track_status" DEFAULT 'GENERATING' NOT NULL,
	"provider" text NOT NULL,
	"voice_id" text NOT NULL,
	"voice_name" text NOT NULL,
	"gender" text NOT NULL,
	"accent" text NOT NULL,
	"model_id" text,
	"characters" integer NOT NULL,
	"text_hash" text NOT NULL,
	"word_timings" jsonb,
	"duration_ms" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"job_id" uuid,
	"error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audio_tracks_gender" CHECK ("audio_tracks"."gender" in ('male', 'female')),
	CONSTRAINT "audio_tracks_accent" CHECK ("audio_tracks"."accent" in ('us', 'uk')),
	CONSTRAINT "audio_tracks_characters" CHECK ("audio_tracks"."characters" > 0)
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" "job_status" DEFAULT 'QUEUED' NOT NULL,
	"payload_json" jsonb NOT NULL,
	"result_json" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"claim_token" uuid,
	"idempotency_key" text NOT NULL,
	"last_error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_site_idempotency" UNIQUE("site_id","idempotency_key"),
	CONSTRAINT "jobs_attempts" CHECK ("jobs"."attempts" >= 0 and "jobs"."max_attempts" > 0)
);
--> statement-breakpoint
ALTER TABLE "audio_tracks" ADD CONSTRAINT "audio_tracks_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_tracks" ADD CONSTRAINT "audio_tracks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_tracks" ADD CONSTRAINT "audio_tracks_revision_fk" FOREIGN KEY ("revision_id","site_id") REFERENCES "public"."resource_revisions"("id","site_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_tracks" ADD CONSTRAINT "audio_tracks_asset_fk" FOREIGN KEY ("asset_id","site_id") REFERENCES "public"."media_assets"("id","site_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audio_tracks_revision" ON "audio_tracks" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "jobs_claimable" ON "jobs" USING btree ("status","available_at");