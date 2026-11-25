ALTER TABLE "audio_tracks" ADD COLUMN "mode" text DEFAULT 'single' NOT NULL;--> statement-breakpoint
ALTER TABLE "audio_tracks" ADD COLUMN "speakers" jsonb;--> statement-breakpoint
ALTER TABLE "resource_revisions" ADD COLUMN "speaker_names" jsonb;--> statement-breakpoint
ALTER TABLE "audio_tracks" ADD CONSTRAINT "audio_tracks_mode" CHECK ("audio_tracks"."mode" in ('single', 'conversation'));