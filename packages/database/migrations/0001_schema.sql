CREATE TYPE "public"."cefr_level" AS ENUM('A1', 'A2', 'B1', 'B2', 'C1', 'C2');--> statement-breakpoint
CREATE TYPE "public"."lexical_entry_kind" AS ENUM('WORD', 'PHRASE', 'COLLOCATION', 'IDIOM', 'PHRASAL_VERB');--> statement-breakpoint
CREATE TYPE "public"."lexical_relation_kind" AS ENUM('SYNONYM', 'ANTONYM', 'WORD_FAMILY', 'RELATED_COLLOCATION');--> statement-breakpoint
CREATE TYPE "public"."media_status" AS ENUM('PENDING', 'READY', 'FAILED', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('SINGLE_CHOICE', 'TRUE_FALSE_NOT_GIVEN', 'GAP_FILL');--> statement-breakpoint
CREATE TYPE "public"."resource_kind" AS ENUM('READING', 'LISTENING', 'LEXICAL_COLLECTION', 'ARTICLE');--> statement-breakpoint
CREATE TYPE "public"."resource_relation_kind" AS ENUM('RELATED', 'PREREQUISITE', 'COMPANION');--> statement-breakpoint
CREATE TYPE "public"."revision_status" AS ENUM('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "public"."site_role" AS ENUM('OWNER', 'ADMIN', 'EDITOR', 'REVIEWER', 'VIEWER');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_memberships" (
	"site_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "site_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_memberships_site_id_user_id_pk" PRIMARY KEY("site_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text NOT NULL,
	"name" text NOT NULL,
	"default_locale" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sites_domain_unique" UNIQUE("domain"),
	CONSTRAINT "sites_domain_lowercase" CHECK ("sites"."domain" = lower("sites"."domain"))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "exam_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "exam_labels_site_code" UNIQUE("site_id","code"),
	CONSTRAINT "exam_labels_id_site" UNIQUE("id","site_id")
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"checksum_sha256" text,
	"bytes" bigint,
	"duration_ms" integer,
	"status" "media_status" DEFAULT 'PENDING' NOT NULL,
	"source" text,
	"license" text,
	"attribution" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_objectKey_unique" UNIQUE("object_key"),
	CONSTRAINT "media_assets_id_site" UNIQUE("id","site_id"),
	CONSTRAINT "media_assets_bytes" CHECK ("media_assets"."bytes" is null or "media_assets"."bytes" >= 0),
	CONSTRAINT "media_assets_duration" CHECK ("media_assets"."duration_ms" is null or "media_assets"."duration_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "resource_localizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"slug" text NOT NULL,
	"draft_revision_id" uuid,
	"published_revision_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "localizations_site_locale_slug" UNIQUE("site_id","locale","slug"),
	CONSTRAINT "localizations_resource_locale" UNIQUE("resource_id","locale"),
	CONSTRAINT "localizations_id_site" UNIQUE("id","site_id"),
	CONSTRAINT "localizations_slug_format" CHECK ("resource_localizations"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "resource_relations" (
	"site_id" uuid NOT NULL,
	"from_resource_id" uuid NOT NULL,
	"to_resource_id" uuid NOT NULL,
	"kind" "resource_relation_kind" NOT NULL,
	CONSTRAINT "resource_relations_from_resource_id_to_resource_id_kind_pk" PRIMARY KEY("from_resource_id","to_resource_id","kind"),
	CONSTRAINT "resource_relations_not_self" CHECK ("resource_relations"."from_resource_id" <> "resource_relations"."to_resource_id")
);
--> statement-breakpoint
CREATE TABLE "resource_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"localization_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"status" "revision_status" DEFAULT 'DRAFT' NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"cefr_level" "cefr_level",
	"rich_text" jsonb NOT NULL,
	"plain_text" text DEFAULT '' NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"lock_version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || plain_text)) STORED,
	CONSTRAINT "revisions_localization_no" UNIQUE("localization_id","revision_no"),
	CONSTRAINT "revisions_id_site" UNIQUE("id","site_id"),
	CONSTRAINT "revisions_id_localization" UNIQUE("id","localization_id"),
	CONSTRAINT "revisions_no_positive" CHECK ("resource_revisions"."revision_no" > 0),
	CONSTRAINT "revisions_title_length" CHECK (char_length("resource_revisions"."title") between 1 and 200),
	CONSTRAINT "revisions_published_has_date" CHECK ("resource_revisions"."status" not in ('PUBLISHED', 'SUPERSEDED') or "resource_revisions"."published_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"kind" "resource_kind" NOT NULL,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "resources_id_site" UNIQUE("id","site_id")
);
--> statement-breakpoint
CREATE TABLE "revision_exam_labels" (
	"site_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"exam_label_id" uuid NOT NULL,
	CONSTRAINT "revision_exam_labels_revision_id_exam_label_id_pk" PRIMARY KEY("revision_id","exam_label_id")
);
--> statement-breakpoint
CREATE TABLE "revision_media" (
	"site_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"role" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "revision_media_revision_id_asset_id_role_pk" PRIMARY KEY("revision_id","asset_id","role")
);
--> statement-breakpoint
CREATE TABLE "revision_topics" (
	"site_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	CONSTRAINT "revision_topics_revision_id_topic_id_pk" PRIMARY KEY("revision_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topics_site_slug" UNIQUE("site_id","slug"),
	CONSTRAINT "topics_id_site" UNIQUE("id","site_id"),
	CONSTRAINT "topics_slug_format" CHECK ("topics"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "collection_items" (
	"site_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"sense_revision_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "collection_items_revision_id_sense_revision_id_pk" PRIMARY KEY("revision_id","sense_revision_id")
);
--> statement-breakpoint
CREATE TABLE "lexical_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"normalized_headword" text NOT NULL,
	"display_form" text NOT NULL,
	"kind" "lexical_entry_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lexical_entries_id_site" UNIQUE("id","site_id")
);
--> statement-breakpoint
CREATE TABLE "lexical_examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sense_revision_id" uuid NOT NULL,
	"sentence" text NOT NULL,
	"explanation" text,
	"source" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lexical_glosses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sense_revision_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "lexical_glosses_revision_locale" UNIQUE("sense_revision_id","locale")
);
--> statement-breakpoint
CREATE TABLE "lexical_pronunciations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"sense_revision_id" uuid NOT NULL,
	"accent" text NOT NULL,
	"ipa" text NOT NULL,
	"audio_asset_id" uuid
);
--> statement-breakpoint
CREATE TABLE "lexical_relations" (
	"site_id" uuid NOT NULL,
	"source_sense_revision_id" uuid NOT NULL,
	"target_sense_revision_id" uuid NOT NULL,
	"kind" "lexical_relation_kind" NOT NULL,
	CONSTRAINT "lexical_relations_source_sense_revision_id_target_sense_revision_id_kind_pk" PRIMARY KEY("source_sense_revision_id","target_sense_revision_id","kind"),
	CONSTRAINT "lexical_relations_not_self" CHECK ("lexical_relations"."source_sense_revision_id" <> "lexical_relations"."target_sense_revision_id")
);
--> statement-breakpoint
CREATE TABLE "lexical_sense_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"sense_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"status" "revision_status" DEFAULT 'DRAFT' NOT NULL,
	"definition_en" text NOT NULL,
	"cefr_level" "cefr_level",
	"usage_note" text,
	"register" text,
	"lock_version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "sense_revisions_sense_no" UNIQUE("sense_id","revision_no"),
	CONSTRAINT "sense_revisions_id_site" UNIQUE("id","site_id"),
	CONSTRAINT "sense_revisions_id_sense" UNIQUE("id","sense_id"),
	CONSTRAINT "sense_revisions_no_positive" CHECK ("lexical_sense_revisions"."revision_no" > 0),
	CONSTRAINT "sense_revisions_published_has_date" CHECK ("lexical_sense_revisions"."status" not in ('PUBLISHED', 'SUPERSEDED') or "lexical_sense_revisions"."published_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "lexical_senses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"part_of_speech" text NOT NULL,
	"sense_key" text NOT NULL,
	"draft_revision_id" uuid,
	"published_revision_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lexical_senses_entry_key" UNIQUE("entry_id","sense_key"),
	CONSTRAINT "lexical_senses_id_site" UNIQUE("id","site_id")
);
--> statement-breakpoint
CREATE TABLE "answer_keys" (
	"question_id" uuid PRIMARY KEY NOT NULL,
	"grading_json" jsonb NOT NULL,
	"explanation" text,
	"grading_version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercise_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"title" text NOT NULL,
	"instructions" text,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "exercise_sets_id_site" UNIQUE("id","site_id")
);
--> statement-breakpoint
CREATE TABLE "question_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"content" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"exercise_set_id" uuid NOT NULL,
	"type" "question_type" NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"prompt_json" jsonb NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"points" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "questions_points_positive" CHECK ("questions"."points" > 0)
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_memberships" ADD CONSTRAINT "site_memberships_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_memberships" ADD CONSTRAINT "site_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_labels" ADD CONSTRAINT "exam_labels_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_localizations" ADD CONSTRAINT "resource_localizations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_localizations" ADD CONSTRAINT "localizations_resource_fk" FOREIGN KEY ("resource_id","site_id") REFERENCES "public"."resources"("id","site_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_relations" ADD CONSTRAINT "resource_relations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_relations" ADD CONSTRAINT "resource_relations_from_fk" FOREIGN KEY ("from_resource_id","site_id") REFERENCES "public"."resources"("id","site_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_relations" ADD CONSTRAINT "resource_relations_to_fk" FOREIGN KEY ("to_resource_id","site_id") REFERENCES "public"."resources"("id","site_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_revisions" ADD CONSTRAINT "resource_revisions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_revisions" ADD CONSTRAINT "resource_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_revisions" ADD CONSTRAINT "resource_revisions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_revisions" ADD CONSTRAINT "revisions_localization_fk" FOREIGN KEY ("localization_id","site_id") REFERENCES "public"."resource_localizations"("id","site_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_exam_labels" ADD CONSTRAINT "revision_exam_labels_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_exam_labels" ADD CONSTRAINT "revision_exam_labels_revision_fk" FOREIGN KEY ("revision_id","site_id") REFERENCES "public"."resource_revisions"("id","site_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_exam_labels" ADD CONSTRAINT "revision_exam_labels_label_fk" FOREIGN KEY ("exam_label_id","site_id") REFERENCES "public"."exam_labels"("id","site_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_media" ADD CONSTRAINT "revision_media_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_media" ADD CONSTRAINT "revision_media_revision_fk" FOREIGN KEY ("revision_id","site_id") REFERENCES "public"."resource_revisions"("id","site_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_media" ADD CONSTRAINT "revision_media_asset_fk" FOREIGN KEY ("asset_id","site_id") REFERENCES "public"."media_assets"("id","site_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_topics" ADD CONSTRAINT "revision_topics_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_topics" ADD CONSTRAINT "revision_topics_revision_fk" FOREIGN KEY ("revision_id","site_id") REFERENCES "public"."resource_revisions"("id","site_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_topics" ADD CONSTRAINT "revision_topics_topic_fk" FOREIGN KEY ("topic_id","site_id") REFERENCES "public"."topics"("id","site_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_revision_fk" FOREIGN KEY ("revision_id","site_id") REFERENCES "public"."resource_revisions"("id","site_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_sense_fk" FOREIGN KEY ("sense_revision_id","site_id") REFERENCES "public"."lexical_sense_revisions"("id","site_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexical_entries" ADD CONSTRAINT "lexical_entries_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexical_examples" ADD CONSTRAINT "lexical_examples_sense_revision_id_lexical_sense_revisions_id_fk" FOREIGN KEY ("sense_revision_id") REFERENCES "public"."lexical_sense_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexical_glosses" ADD CONSTRAINT "lexical_glosses_sense_revision_id_lexical_sense_revisions_id_fk" FOREIGN KEY ("sense_revision_id") REFERENCES "public"."lexical_sense_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexical_pronunciations" ADD CONSTRAINT "lexical_pronunciations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexical_pronunciations" ADD CONSTRAINT "pronunciations_revision_fk" FOREIGN KEY ("sense_revision_id","site_id") REFERENCES "public"."lexical_sense_revisions"("id","site_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexical_pronunciations" ADD CONSTRAINT "pronunciations_audio_fk" FOREIGN KEY ("audio_asset_id","site_id") REFERENCES "public"."media_assets"("id","site_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexical_relations" ADD CONSTRAINT "lexical_relations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexical_relations" ADD CONSTRAINT "lexical_relations_source_fk" FOREIGN KEY ("source_sense_revision_id","site_id") REFERENCES "public"."lexical_sense_revisions"("id","site_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexical_relations" ADD CONSTRAINT "lexical_relations_target_fk" FOREIGN KEY ("target_sense_revision_id","site_id") REFERENCES "public"."lexical_sense_revisions"("id","site_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexical_sense_revisions" ADD CONSTRAINT "lexical_sense_revisions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexical_sense_revisions" ADD CONSTRAINT "lexical_sense_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexical_sense_revisions" ADD CONSTRAINT "sense_revisions_sense_fk" FOREIGN KEY ("sense_id","site_id") REFERENCES "public"."lexical_senses"("id","site_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexical_senses" ADD CONSTRAINT "lexical_senses_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexical_senses" ADD CONSTRAINT "lexical_senses_entry_fk" FOREIGN KEY ("entry_id","site_id") REFERENCES "public"."lexical_entries"("id","site_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_keys" ADD CONSTRAINT "answer_keys_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_sets" ADD CONSTRAINT "exercise_sets_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_sets" ADD CONSTRAINT "exercise_sets_revision_fk" FOREIGN KEY ("revision_id","site_id") REFERENCES "public"."resource_revisions"("id","site_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_set_fk" FOREIGN KEY ("exercise_set_id","site_id") REFERENCES "public"."exercise_sets"("id","site_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "localizations_published" ON "resource_localizations" USING btree ("site_id","locale","published_revision_id");--> statement-breakpoint
CREATE INDEX "revisions_search" ON "resource_revisions" USING gin ("search");--> statement-breakpoint
CREATE INDEX "revisions_browse" ON "resource_revisions" USING btree ("site_id","status","cefr_level");--> statement-breakpoint
CREATE INDEX "resources_site_kind" ON "resources" USING btree ("site_id","kind");--> statement-breakpoint
CREATE INDEX "revision_media_asset" ON "revision_media" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "revision_topics_topic" ON "revision_topics" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "lexical_entries_headword" ON "lexical_entries" USING btree ("site_id","normalized_headword");--> statement-breakpoint
CREATE INDEX "lexical_entries_headword_trgm" ON "lexical_entries" USING gin ("normalized_headword" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "audit_events_site_time" ON "audit_events" USING btree ("site_id","created_at");