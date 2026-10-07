-- App slugs become globally unique (routes are /apps/$slug). Existing cross-platform duplicates
-- are renamed first: the oldest app keeps the slug, later ones get a platform suffix
-- (`linear` → `linear-ios`), and anything still clashing gets an id suffix.
UPDATE `app` SET `slug` = substr(`slug`, 1, 79 - length(`platform`)) || '-' || `platform`
WHERE EXISTS (
  SELECT 1 FROM `app` AS `older`
  WHERE `older`.`slug` = `app`.`slug` AND `older`.`id` != `app`.`id`
    AND (`older`.`created_at` < `app`.`created_at`
      OR (`older`.`created_at` = `app`.`created_at` AND `older`.`id` < `app`.`id`))
);
--> statement-breakpoint
UPDATE `app` SET `slug` = substr(`slug`, 1, 71) || '-' || substr(`id`, -8)
WHERE EXISTS (
  SELECT 1 FROM `app` AS `older`
  WHERE `older`.`slug` = `app`.`slug` AND `older`.`id` != `app`.`id`
    AND (`older`.`created_at` < `app`.`created_at`
      OR (`older`.`created_at` = `app`.`created_at` AND `older`.`id` < `app`.`id`))
);
--> statement-breakpoint
DROP INDEX `app_platform_slug_idx`;
--> statement-breakpoint
CREATE UNIQUE INDEX `app_slug_idx` ON `app` (`slug`);
