-- A contributor's own list (GET /api/v1/me/contributions) pages newest first by (created_at, id),
-- optionally for one status. These indexes let each page seek to its cursor and read about one
-- page of rows, where the single-column contributor index read all of a contributor's rows.
-- Both still lead with contributor_id, so the foreign key's ON DELETE SET NULL keeps an index.
DROP INDEX IF EXISTS `flow_contributor_idx`;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `flow_contributor_created_idx` ON `flow` (`contributor_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `flow_contributor_status_created_idx` ON `flow` (`contributor_id`,`status`,`created_at`,`id`);--> statement-breakpoint
DROP INDEX IF EXISTS `screen_contributor_idx`;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `screen_contributor_created_idx` ON `screen` (`contributor_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `screen_contributor_status_created_idx` ON `screen` (`contributor_id`,`status`,`created_at`,`id`);