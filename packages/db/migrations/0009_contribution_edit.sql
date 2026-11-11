-- IF NOT EXISTS lets this run again: previews migrate the shared dev D1 by file name, and a
-- file renumbered at rebase counts as new there.
CREATE TABLE IF NOT EXISTS `contribution_edit` (
	`id` integer PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`item_id` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
