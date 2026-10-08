ALTER TABLE `screen` ADD `original_key` text;--> statement-breakpoint
ALTER TABLE `screen` ADD `display_version` integer;--> statement-breakpoint
ALTER TABLE `screen` ADD `display_exception` text;--> statement-breakpoint
CREATE INDEX `screen_display_version_idx` ON `screen` (`display_version`);