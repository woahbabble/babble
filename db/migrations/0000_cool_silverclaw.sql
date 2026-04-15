CREATE TABLE "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"reputation" integer DEFAULT 100 NOT NULL,
	"is_shadow_banned" boolean DEFAULT false NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"url_normalized" text NOT NULL,
	"archive_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "threads_url_normalized_unique" UNIQUE("url_normalized")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"url_normalized" text NOT NULL,
	"body" text NOT NULL,
	"body_normalized" text,
	"user_id" bigint NOT NULL,
	"parent_id" bigint,
	"created_at" timestamp with time zone DEFAULT now(),
	"is_removed" boolean DEFAULT false NOT NULL,
	"anchor_text" text,
	"anchor_selector" text,
	"is_low_quality" boolean DEFAULT false NOT NULL,
	"is_the_pit" boolean DEFAULT false NOT NULL,
	"layer_id" text DEFAULT 'public' NOT NULL,
	CONSTRAINT "idx_comments_unique_thread_body" UNIQUE("url_normalized","body_normalized")
);
--> statement-breakpoint
CREATE TABLE "comment_votes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"comment_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"vote" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "idx_comment_votes_unique_user_comment" UNIQUE("user_id","comment_id")
);
--> statement-breakpoint
CREATE TABLE "comment_flags" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"comment_id" bigint NOT NULL,
	"reporter_user_id" bigint NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	CONSTRAINT "idx_flags_unique_reporter_comment" UNIQUE("comment_id","reporter_user_id")
);
--> statement-breakpoint
CREATE TABLE "site_tags" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"url_normalized" text NOT NULL,
	"tag" text NOT NULL,
	"user_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "idx_site_tags_unique_user_url_tag" UNIQUE("user_id","url_normalized","tag")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"domain" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "idx_subscriptions_unique_user_domain" UNIQUE("user_id","domain")
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_votes" ADD CONSTRAINT "comment_votes_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_votes" ADD CONSTRAINT "comment_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_flags" ADD CONSTRAINT "comment_flags_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_flags" ADD CONSTRAINT "comment_flags_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_tags" ADD CONSTRAINT "site_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_threads_url_normalized" ON "threads" USING btree ("url_normalized");--> statement-breakpoint
CREATE INDEX "idx_comments_url" ON "comments" USING btree ("url_normalized");--> statement-breakpoint
CREATE INDEX "idx_comment_votes_comment" ON "comment_votes" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "idx_flags_status_created" ON "comment_flags" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_site_tags_url" ON "site_tags" USING btree ("url_normalized");--> statement-breakpoint
CREATE INDEX "idx_site_tags_tag" ON "site_tags" USING btree ("tag");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_domain" ON "subscriptions" USING btree ("domain");