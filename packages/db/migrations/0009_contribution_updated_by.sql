-- SQLite can't add a column only when it is missing, so this file can't run twice. The shared dev
-- D1 records applied migrations by file name, so keep this name even if 0009 is taken at merge.
-- Wrangler applies every unapplied file and does not need contiguous numbers.
ALTER TABLE `flow` ADD `updated_by` text;--> statement-breakpoint
ALTER TABLE `screen` ADD `updated_by` text;
