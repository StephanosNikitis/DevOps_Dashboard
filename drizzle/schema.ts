/**
 * This file is the single source of truth for your database tables.
 * Instead of writing SQL like `CREATE TABLE deployments (...)`, you define
 * tables in TypeScript using Drizzle's helper functions.
 *
 * Drizzle then uses this file for two things:
 *   1. drizzle-kit reads it to GENERATE SQL migration files (db:generate)
 *   2. The `db` client reads it to give you TypeScript types on queries
 */

import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  varchar,
  boolean,
} from "drizzle-orm/pg-core";

// TABLE 1: deployments
//
// Stores the CI/CD build history. Each row = one GitHub Actions pipeline run.
// Rows are inserted when GitHub sends a webhook to /api/webhook/github.

export const deployments = pgTable("deployments", {
  // `serial` = auto-incrementing integer primary key (1, 2, 3 ...)
  // You never set this manually — the database assigns it on INSERT
  id: serial("id").primaryKey(),

  // e.g. "my-org/my-repo"
  repo: varchar("repo", { length: 255 }).notNull(),

  // e.g. "main", "feature/new-login"
  branch: varchar("branch", { length: 255 }).notNull(),

  // One of: "pending" | "running" | "success" | "failed"
  // We use varchar here instead of a DB enum to keep migrations simpler
  status: varchar("status", { length: 50 }).notNull().default("pending"),

  // The full 40-char git commit hash (optional — not always in the webhook)
  commitSha: varchar("commit_sha", { length: 40 }),

  // The first line of the commit message, e.g. "fix: resolve memory leak"
  commitMessage: text("commit_message"),

  // When the GitHub webhook arrived (= when the pipeline was triggered)
  // .defaultNow() means: if you INSERT without providing this, use NOW()
  triggeredAt: timestamp("triggered_at").defaultNow().notNull(),

  // When the pipeline finished — NULL while it's still running
  finishedAt: timestamp("finished_at"),
});

// TABLE 2: alerts
//
// Stores alert rules configured by the user.
// Example rule: "Alert me on Slack if CPU > 80% for more than 2 minutes"
//
// Each row = one alert rule.
// The alert evaluation logic (does the current metric exceed the threshold?)
// lives in /lib/alerts.ts — not here. The table only stores the config.

export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),

  // Human-readable name, e.g. "High CPU Warning"
  name: varchar("name", { length: 255 }).notNull(),

  // Which metric to watch: "cpu" | "ram" | "disk"
  metric: varchar("metric", { length: 50 }).notNull(),

  // The percentage threshold that triggers the alert (0–100)
  // e.g. 80 means "fire when usage exceeds 80%"
  threshold: integer("threshold").notNull(),

  // How long (in seconds) the metric must exceed the threshold before alerting.
  // Default = 120 seconds (2 minutes) to avoid noisy one-off spikes.
  durationSeconds: integer("duration_seconds").notNull().default(120),

  // Where to send the alert: "slack" or "email"
  channel: varchar("channel", { length: 50 }).notNull().default("slack"),

  // The destination: Slack webhook URL or email address
  channelTarget: text("channel_target"),

  // Whether this rule is currently active (can be toggled in the UI)
  isActive: boolean("is_active").notNull().default(true),

  // When this alert last fired — used to prevent re-alerting every second
  lastTriggered: timestamp("last_triggered"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// INFERRED TYPES
//
// Drizzle generates TypeScript types directly from the schema above.
// You import these types in your API routes and components — no manual
// interface definitions needed.
//
//   `Deployment`    = the shape of a row you SELECT from the table
//   `NewDeployment` = the shape of an object you INSERT into the table
//                     (id/createdAt/defaults are all optional)

export type Deployment = typeof deployments.$inferSelect;
export type NewDeployment = typeof deployments.$inferInsert;

export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;
