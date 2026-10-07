CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `api_key` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`hash` text NOT NULL,
	`last_used_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_key_hash_unique` ON `api_key` (`hash`);--> statement-breakpoint
CREATE INDEX `api_key_user_idx` ON `api_key` (`user_id`);--> statement-breakpoint
CREATE TABLE `app` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`tagline` text,
	`description` text,
	`website_url` text,
	`host` text,
	`platform` text NOT NULL,
	`category` text,
	`logo_key` text,
	`accent_color` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`contributor_id` text,
	`view_count` integer DEFAULT 0 NOT NULL,
	`save_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`contributor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_platform_slug_idx` ON `app` (`platform`,`slug`);--> statement-breakpoint
CREATE INDEX `app_platform_host_idx` ON `app` (`platform`,`host`);--> statement-breakpoint
CREATE INDEX `app_status_created_idx` ON `app` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `app_contributor_idx` ON `app` (`contributor_id`);--> statement-breakpoint
CREATE TABLE `collection` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `collection_user_idx` ON `collection` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `collection_user_default_idx` ON `collection` (`user_id`) WHERE "collection"."is_default" = 1;--> statement-breakpoint
CREATE TABLE `collection_item` (
	`collection_id` text NOT NULL,
	`kind` text NOT NULL,
	`item_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`collection_id`, `kind`, `item_id`),
	FOREIGN KEY (`collection_id`) REFERENCES `collection`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `collection_item_item_idx` ON `collection_item` (`kind`,`item_id`);--> statement-breakpoint
CREATE TABLE `flow` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text,
	`description` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`contributor_id` text,
	`review_reason` text,
	`step_count` integer DEFAULT 0 NOT NULL,
	`view_count` integer DEFAULT 0 NOT NULL,
	`save_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `app`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contributor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `flow_status_created_idx` ON `flow` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `flow_app_idx` ON `flow` (`app_id`);--> statement-breakpoint
CREATE INDEX `flow_contributor_idx` ON `flow` (`contributor_id`);--> statement-breakpoint
CREATE TABLE `flow_step` (
	`flow_id` text NOT NULL,
	`position` integer NOT NULL,
	`screen_id` text NOT NULL,
	`label` text,
	PRIMARY KEY(`flow_id`, `position`),
	FOREIGN KEY (`flow_id`) REFERENCES `flow`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`screen_id`) REFERENCES `screen`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `flow_step_screen_idx` ON `flow_step` (`screen_id`);--> statement-breakpoint
CREATE TABLE `screen` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`image_key` text NOT NULL,
	`thumb_key` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`bytes` integer NOT NULL,
	`thumb_width` integer NOT NULL,
	`thumb_height` integer NOT NULL,
	`title` text,
	`source_url` text,
	`text` text,
	`patterns` text DEFAULT '[]' NOT NULL,
	`elements` text DEFAULT '[]' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`version` text,
	`dominant_color` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`source` text DEFAULT 'upload' NOT NULL,
	`contributor_id` text,
	`review_reason` text,
	`view_count` integer DEFAULT 0 NOT NULL,
	`save_count` integer DEFAULT 0 NOT NULL,
	`captured_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `app`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contributor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `screen_status_created_idx` ON `screen` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `screen_app_created_idx` ON `screen` (`app_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `screen_app_image_idx` ON `screen` (`app_id`,`image_key`);--> statement-breakpoint
CREATE INDEX `screen_contributor_idx` ON `screen` (`contributor_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);