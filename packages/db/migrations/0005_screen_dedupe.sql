-- One screen per image, per app and contributor, for parallel uploads that all pass the duplicate
-- check before any of them inserts. A unique index on image_key itself would fail on duplicates
-- already in production, so the claim is its own column: the oldest row of each group takes it,
-- and the other rows stay as they are, with no claim. Rejected rows don't count as duplicates.
ALTER TABLE `screen` ADD `dedupe_image_key` text;--> statement-breakpoint
UPDATE `screen` SET `dedupe_image_key` = `image_key` WHERE `id` IN (
  SELECT `id` FROM (
    SELECT `id`, row_number() OVER (
      PARTITION BY `app_id`, `contributor_id`, `image_key` ORDER BY `created_at`, `id`
    ) AS `rank`
    FROM `screen`
    WHERE `status` != 'rejected' AND `contributor_id` IS NOT NULL
  ) WHERE `rank` = 1
);--> statement-breakpoint
CREATE UNIQUE INDEX `screen_dedupe_idx` ON `screen` (`app_id`,`contributor_id`,`dedupe_image_key`);
