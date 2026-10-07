CREATE TABLE `instance_bootstrap` (
	`id` integer PRIMARY KEY NOT NULL,
	`admin_user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `app_logo_key_idx` ON `app` (`logo_key`);--> statement-breakpoint
CREATE INDEX `screen_image_key_idx` ON `screen` (`image_key`);--> statement-breakpoint
CREATE INDEX `screen_thumb_key_idx` ON `screen` (`thumb_key`);--> statement-breakpoint
-- First user ever becomes admin, atomically: the trigger runs inside the INSERT statement, and the
-- singleton bootstrap row (id = 1) can only be claimed once.
INSERT OR IGNORE INTO `instance_bootstrap` (`id`, `admin_user_id`, `created_at`)
  SELECT 1, `id`, `created_at` FROM `user` ORDER BY `created_at`, `id` LIMIT 1;
--> statement-breakpoint
CREATE TRIGGER `user_bootstrap_admin` AFTER INSERT ON `user`
WHEN NOT EXISTS (SELECT 1 FROM instance_bootstrap WHERE id = 1) BEGIN
  INSERT INTO instance_bootstrap (id, admin_user_id) VALUES (1, new.id);
  UPDATE user SET role = 'admin' WHERE id = new.id;
END;
--> statement-breakpoint
-- save_count is derived from collection_item; triggers also cover cascaded deletes (collection or
-- user removal).
CREATE TRIGGER `collection_item_count_insert` AFTER INSERT ON `collection_item` BEGIN
  UPDATE screen SET save_count = save_count + 1 WHERE new.kind = 'screen' AND id = new.item_id;
  UPDATE flow SET save_count = save_count + 1 WHERE new.kind = 'flow' AND id = new.item_id;
  UPDATE app SET save_count = save_count + 1 WHERE new.kind = 'app' AND id = new.item_id;
END;
--> statement-breakpoint
CREATE TRIGGER `collection_item_count_delete` AFTER DELETE ON `collection_item` BEGIN
  UPDATE screen SET save_count = max(0, save_count - 1) WHERE old.kind = 'screen' AND id = old.item_id;
  UPDATE flow SET save_count = max(0, save_count - 1) WHERE old.kind = 'flow' AND id = old.item_id;
  UPDATE app SET save_count = max(0, save_count - 1) WHERE old.kind = 'app' AND id = old.item_id;
END;
--> statement-breakpoint
-- Recompute existing counters once so they match collection_item exactly.
UPDATE screen SET save_count = (SELECT count(*) FROM collection_item WHERE kind = 'screen' AND item_id = screen.id);
--> statement-breakpoint
UPDATE flow SET save_count = (SELECT count(*) FROM collection_item WHERE kind = 'flow' AND item_id = flow.id);
--> statement-breakpoint
UPDATE app SET save_count = (SELECT count(*) FROM collection_item WHERE kind = 'app' AND item_id = app.id);
