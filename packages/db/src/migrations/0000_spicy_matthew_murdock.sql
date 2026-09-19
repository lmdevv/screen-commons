CREATE TABLE `asset_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`screen_id` text NOT NULL,
	`kind` text NOT NULL,
	`object_key` text NOT NULL,
	`mime_type` text DEFAULT 'image/webp' NOT NULL,
	`byte_size` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`sha256` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by_id` text,
	`updated_by_id` text,
	FOREIGN KEY (`screen_id`) REFERENCES `screens`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "asset_variants_byte_size_check" CHECK("asset_variants"."byte_size" > 0 AND "asset_variants"."byte_size" <= 15728640),
	CONSTRAINT "asset_variants_dimensions_check" CHECK("asset_variants"."width" > 0 AND "asset_variants"."height" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_variants_screen_kind_unique` ON `asset_variants` (`screen_id`,`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `asset_variants_object_key_unique` ON `asset_variants` (`object_key`);--> statement-breakpoint
CREATE TABLE `flow_screens` (
	`id` text PRIMARY KEY NOT NULL,
	`flow_id` text NOT NULL,
	`screen_id` text NOT NULL,
	`position` integer NOT NULL,
	`caption` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by_id` text,
	`updated_by_id` text,
	FOREIGN KEY (`flow_id`) REFERENCES `flows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`screen_id`) REFERENCES `screens`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "flow_screens_position_check" CHECK("flow_screens"."position" >= 0 AND "flow_screens"."position" < 50)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `flow_screens_flow_position_unique` ON `flow_screens` (`flow_id`,`position`);--> statement-breakpoint
CREATE INDEX `flow_screens_screen_idx` ON `flow_screens` (`screen_id`);--> statement-breakpoint
CREATE TABLE `flows` (
	`id` text PRIMARY KEY NOT NULL,
	`product_version_id` text NOT NULL,
	`submission_id` text,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`platform` text NOT NULL,
	`source_url` text,
	`captured_at` integer NOT NULL,
	`rights_status` text DEFAULT 'unverified' NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`published_at` integer,
	`deleted_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by_id` text,
	`updated_by_id` text,
	FOREIGN KEY (`product_version_id`) REFERENCES `product_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `flows_version_slug_unique` ON `flows` (`product_version_id`,`slug`);--> statement-breakpoint
CREATE INDEX `flows_version_visibility_idx` ON `flows` (`product_version_id`,`visibility`);--> statement-breakpoint
CREATE INDEX `flows_platform_captured_idx` ON `flows` (`platform`,`captured_at`);--> statement-breakpoint
CREATE TABLE `moderation_results` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`submission_item_id` text,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`pipeline_version` text NOT NULL,
	`stage` text NOT NULL,
	`outcome` text NOT NULL,
	`confidence_basis_points` integer NOT NULL,
	`categories` text DEFAULT '[]' NOT NULL,
	`duplicate_outcome` text DEFAULT 'none' NOT NULL,
	`duplicate_screen_id` text,
	`suggested_tags` text DEFAULT '[]' NOT NULL,
	`suggested_title` text,
	`evidence` text DEFAULT '[]' NOT NULL,
	`raw_response` text,
	`reviewed_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by_id` text,
	`updated_by_id` text,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`submission_item_id`) REFERENCES `submission_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`duplicate_screen_id`) REFERENCES `screens`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "moderation_results_confidence_check" CHECK("moderation_results"."confidence_basis_points" >= 0 AND "moderation_results"."confidence_basis_points" <= 10000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `moderation_results_idempotency_unique` ON `moderation_results` (`submission_id`,`submission_item_id`,`pipeline_version`,`stage`);--> statement-breakpoint
CREATE INDEX `moderation_results_submission_idx` ON `moderation_results` (`submission_id`,`reviewed_at`);--> statement-breakpoint
CREATE TABLE `product_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`released_on` text,
	`captured_at` integer NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`published_at` integer,
	`deleted_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by_id` text,
	`updated_by_id` text,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_versions_product_label_unique` ON `product_versions` (`product_id`,`label`);--> statement-breakpoint
CREATE INDEX `product_versions_product_captured_idx` ON `product_versions` (`product_id`,`captured_at`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`description` text,
	`website_url` text,
	`logo_url` text,
	`visibility` text DEFAULT 'private' NOT NULL,
	`published_at` integer,
	`deleted_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by_id` text,
	`updated_by_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);--> statement-breakpoint
CREATE INDEX `products_visibility_name_idx` ON `products` (`visibility`,`name`);--> statement-breakpoint
CREATE TABLE `review_events` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`actor_id` text,
	`event_type` text NOT NULL,
	`from_state` text,
	`to_state` text,
	`reason` text,
	`detail` text,
	`correlation_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `review_events_submission_created_idx` ON `review_events` (`submission_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `review_stage_claims` (
	`idempotency_key` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`submission_item_id` text,
	`pipeline_version` text NOT NULL,
	`stage` text NOT NULL,
	`status` text NOT NULL,
	`attempt` integer DEFAULT 1 NOT NULL,
	`error_code` text,
	`claimed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`completed_at` integer,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`submission_item_id`) REFERENCES `submission_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `review_stage_claims_submission_idx` ON `review_stage_claims` (`submission_id`,`stage`);--> statement-breakpoint
CREATE TABLE `screen_tags` (
	`screen_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by_id` text,
	PRIMARY KEY(`screen_id`, `tag_id`),
	FOREIGN KEY (`screen_id`) REFERENCES `screens`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `screen_tags_tag_idx` ON `screen_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `screens` (
	`id` text PRIMARY KEY NOT NULL,
	`product_version_id` text NOT NULL,
	`submission_id` text,
	`title` text NOT NULL,
	`description` text,
	`platform` text NOT NULL,
	`source_url` text,
	`captured_at` integer NOT NULL,
	`visible_text` text,
	`sha256` text NOT NULL,
	`perceptual_hash` text,
	`is_standalone` integer DEFAULT false NOT NULL,
	`rights_status` text DEFAULT 'unverified' NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`published_at` integer,
	`deleted_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by_id` text,
	`updated_by_id` text,
	FOREIGN KEY (`product_version_id`) REFERENCES `product_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `screens_sha256_unique` ON `screens` (`sha256`);--> statement-breakpoint
CREATE INDEX `screens_version_visibility_idx` ON `screens` (`product_version_id`,`visibility`);--> statement-breakpoint
CREATE INDEX `screens_platform_captured_idx` ON `screens` (`platform`,`captured_at`);--> statement-breakpoint
CREATE INDEX `screens_perceptual_hash_idx` ON `screens` (`perceptual_hash`);--> statement-breakpoint
CREATE TABLE `submission_items` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`source_url` text,
	`captured_at` integer NOT NULL,
	`visible_text` text,
	`full_object_key` text NOT NULL,
	`full_byte_size` integer NOT NULL,
	`full_width` integer NOT NULL,
	`full_height` integer NOT NULL,
	`full_sha256` text NOT NULL,
	`thumbnail_object_key` text NOT NULL,
	`thumbnail_byte_size` integer NOT NULL,
	`thumbnail_width` integer NOT NULL,
	`thumbnail_height` integer NOT NULL,
	`thumbnail_sha256` text NOT NULL,
	`perceptual_hash` text,
	`linked_screen_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by_id` text,
	`updated_by_id` text,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`linked_screen_id`) REFERENCES `screens`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "submission_items_position_check" CHECK("submission_items"."position" >= 0 AND "submission_items"."position" < 50)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submission_items_submission_position_unique` ON `submission_items` (`submission_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `submission_items_full_object_key_unique` ON `submission_items` (`full_object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `submission_items_thumbnail_object_key_unique` ON `submission_items` (`thumbnail_object_key`);--> statement-breakpoint
CREATE INDEX `submission_items_full_sha256_idx` ON `submission_items` (`full_sha256`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`product_id` text,
	`product_version_id` text,
	`flow_name` text,
	`platform` text NOT NULL,
	`rights_status` text DEFAULT 'unverified' NOT NULL,
	`pipeline_version` text DEFAULT 'v1' NOT NULL,
	`correlation_id` text NOT NULL,
	`submitted_at` integer,
	`published_at` integer,
	`removal_requested_at` integer,
	`deletion_due_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by_id` text,
	`updated_by_id` text,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`product_version_id`) REFERENCES `product_versions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_correlation_id_unique` ON `submissions` (`correlation_id`);--> statement-breakpoint
CREATE INDEX `submissions_owner_updated_idx` ON `submissions` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `submissions_state_updated_idx` ON `submissions` (`state`,`updated_at`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by_id` text,
	`updated_by_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_slug_unique` ON `tags` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`clerk_user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`primary_email` text,
	`avatar_url` text,
	`role` text DEFAULT 'contributor' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_seen_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by_id` text,
	`updated_by_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_clerk_user_id_unique` ON `users` (`clerk_user_id`);--> statement-breakpoint
CREATE INDEX `users_role_status_idx` ON `users` (`role`,`status`);--> statement-breakpoint

-- Drizzle does not model SQLite virtual tables. This migration owns the typed catalog's FTS5
-- projection and its synchronization triggers; application queries live in src/queries.ts.
CREATE VIRTUAL TABLE `search_index` USING fts5(
	`entity_type` UNINDEXED,
	`entity_id` UNINDEXED,
	`title`,
	`description`,
	`aliases`,
	`tags`,
	`platform`,
	`visible_text`,
	`product_id` UNINDEXED,
	`product_version_id` UNINDEXED,
	tokenize = 'unicode61 remove_diacritics 2'
);--> statement-breakpoint

CREATE TRIGGER `products_search_insert` AFTER INSERT ON `products`
WHEN NEW.`visibility` = 'published'
BEGIN
	INSERT INTO `search_index` (`entity_type`, `entity_id`, `title`, `description`, `aliases`, `tags`, `platform`, `visible_text`, `product_id`, `product_version_id`)
	VALUES ('product', NEW.`id`, NEW.`name`, COALESCE(NEW.`description`, ''), COALESCE(NEW.`aliases`, '[]'), '', '', '', NEW.`id`, NULL);
END;--> statement-breakpoint
CREATE TRIGGER `products_search_update` AFTER UPDATE ON `products`
BEGIN
	DELETE FROM `search_index` WHERE `entity_type` = 'product' AND `entity_id` = OLD.`id`;
	INSERT INTO `search_index` (`entity_type`, `entity_id`, `title`, `description`, `aliases`, `tags`, `platform`, `visible_text`, `product_id`, `product_version_id`)
	SELECT 'product', NEW.`id`, NEW.`name`, COALESCE(NEW.`description`, ''), COALESCE(NEW.`aliases`, '[]'), '', '', '', NEW.`id`, NULL
	WHERE NEW.`visibility` = 'published';
END;--> statement-breakpoint
CREATE TRIGGER `products_search_delete` AFTER DELETE ON `products`
BEGIN
	DELETE FROM `search_index` WHERE `entity_type` = 'product' AND `entity_id` = OLD.`id`;
END;--> statement-breakpoint

CREATE TRIGGER `flows_search_insert` AFTER INSERT ON `flows`
WHEN NEW.`visibility` = 'published'
BEGIN
	INSERT INTO `search_index` (`entity_type`, `entity_id`, `title`, `description`, `aliases`, `tags`, `platform`, `visible_text`, `product_id`, `product_version_id`)
	SELECT 'flow', NEW.`id`, NEW.`name`, COALESCE(NEW.`description`, ''), '', '', NEW.`platform`, '', pv.`product_id`, NEW.`product_version_id`
	FROM `product_versions` pv WHERE pv.`id` = NEW.`product_version_id`;
END;--> statement-breakpoint
CREATE TRIGGER `flows_search_update` AFTER UPDATE ON `flows`
BEGIN
	DELETE FROM `search_index` WHERE `entity_type` = 'flow' AND `entity_id` = OLD.`id`;
	INSERT INTO `search_index` (`entity_type`, `entity_id`, `title`, `description`, `aliases`, `tags`, `platform`, `visible_text`, `product_id`, `product_version_id`)
	SELECT 'flow', NEW.`id`, NEW.`name`, COALESCE(NEW.`description`, ''), '', '', NEW.`platform`, '', pv.`product_id`, NEW.`product_version_id`
	FROM `product_versions` pv
	WHERE pv.`id` = NEW.`product_version_id` AND NEW.`visibility` = 'published';
END;--> statement-breakpoint
CREATE TRIGGER `flows_search_delete` AFTER DELETE ON `flows`
BEGIN
	DELETE FROM `search_index` WHERE `entity_type` = 'flow' AND `entity_id` = OLD.`id`;
END;--> statement-breakpoint

CREATE TRIGGER `screens_search_insert` AFTER INSERT ON `screens`
WHEN NEW.`visibility` = 'published'
BEGIN
	INSERT INTO `search_index` (`entity_type`, `entity_id`, `title`, `description`, `aliases`, `tags`, `platform`, `visible_text`, `product_id`, `product_version_id`)
	SELECT 'screen', NEW.`id`, NEW.`title`, COALESCE(NEW.`description`, ''), '', '', NEW.`platform`, COALESCE(NEW.`visible_text`, ''), pv.`product_id`, NEW.`product_version_id`
	FROM `product_versions` pv WHERE pv.`id` = NEW.`product_version_id`;
END;--> statement-breakpoint
CREATE TRIGGER `screens_search_update` AFTER UPDATE ON `screens`
BEGIN
	DELETE FROM `search_index` WHERE `entity_type` = 'screen' AND `entity_id` = OLD.`id`;
	INSERT INTO `search_index` (`entity_type`, `entity_id`, `title`, `description`, `aliases`, `tags`, `platform`, `visible_text`, `product_id`, `product_version_id`)
	SELECT 'screen', NEW.`id`, NEW.`title`, COALESCE(NEW.`description`, ''), '',
		COALESCE((SELECT group_concat(t.`name`, ' ') FROM `screen_tags` st JOIN `tags` t ON t.`id` = st.`tag_id` WHERE st.`screen_id` = NEW.`id`), ''),
		NEW.`platform`, COALESCE(NEW.`visible_text`, ''), pv.`product_id`, NEW.`product_version_id`
	FROM `product_versions` pv
	WHERE pv.`id` = NEW.`product_version_id` AND NEW.`visibility` = 'published';
END;--> statement-breakpoint
CREATE TRIGGER `screens_search_delete` AFTER DELETE ON `screens`
BEGIN
	DELETE FROM `search_index` WHERE `entity_type` = 'screen' AND `entity_id` = OLD.`id`;
END;--> statement-breakpoint

CREATE TRIGGER `screen_tags_search_insert` AFTER INSERT ON `screen_tags`
BEGIN
	UPDATE `search_index`
	SET `tags` = COALESCE((SELECT group_concat(t.`name`, ' ') FROM `screen_tags` st JOIN `tags` t ON t.`id` = st.`tag_id` WHERE st.`screen_id` = NEW.`screen_id`), '')
	WHERE `entity_type` = 'screen' AND `entity_id` = NEW.`screen_id`;
END;--> statement-breakpoint
CREATE TRIGGER `screen_tags_search_delete` AFTER DELETE ON `screen_tags`
BEGIN
	UPDATE `search_index`
	SET `tags` = COALESCE((SELECT group_concat(t.`name`, ' ') FROM `screen_tags` st JOIN `tags` t ON t.`id` = st.`tag_id` WHERE st.`screen_id` = OLD.`screen_id`), '')
	WHERE `entity_type` = 'screen' AND `entity_id` = OLD.`screen_id`;
END;--> statement-breakpoint
CREATE TRIGGER `tags_search_update` AFTER UPDATE OF `name` ON `tags`
BEGIN
	UPDATE `search_index`
	SET `tags` = COALESCE((SELECT group_concat(t.`name`, ' ') FROM `screen_tags` st JOIN `tags` t ON t.`id` = st.`tag_id` WHERE st.`screen_id` = `search_index`.`entity_id`), '')
	WHERE `entity_type` = 'screen' AND `entity_id` IN (SELECT `screen_id` FROM `screen_tags` WHERE `tag_id` = NEW.`id`);
END;
