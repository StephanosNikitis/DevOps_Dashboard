CREATE TABLE "alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"metric" varchar(50) NOT NULL,
	"threshold" integer NOT NULL,
	"duration_seconds" integer DEFAULT 120 NOT NULL,
	"channel" varchar(50) DEFAULT 'slack' NOT NULL,
	"channel_target" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_triggered" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployments" (
	"id" serial PRIMARY KEY NOT NULL,
	"repo" varchar(255) NOT NULL,
	"branch" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"commit_sha" varchar(40),
	"commit_message" text,
	"triggered_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
