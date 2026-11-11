DROP INDEX IF EXISTS `screen_app_created_idx`;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `screen_app_created_idx` ON `screen` (`app_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `app_facet` (
	`app_id` text NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`count` integer NOT NULL,
	`last_captured_at` integer,
	PRIMARY KEY(`app_id`, `kind`, `value`),
	FOREIGN KEY (`app_id`) REFERENCES `app`(`id`) ON UPDATE no action ON DELETE cascade
) WITHOUT ROWID;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `screen_facet_insert` AFTER INSERT ON `screen`
WHEN new.status = 'published' BEGIN
  INSERT INTO app_facet (app_id, kind, value, count, last_captured_at)
    SELECT new.app_id, kind, value, 1, at FROM (
      SELECT 'screen' AS kind, '' AS value, NULL AS at
      UNION ALL SELECT 'pattern', value, NULL FROM json_each(new.patterns)
      UNION ALL SELECT 'element', value, NULL FROM json_each(new.elements)
      UNION ALL SELECT 'version', new.version, new.captured_at WHERE new.version IS NOT NULL
    ) WHERE true
    ON CONFLICT (app_id, kind, value) DO UPDATE SET count = count + 1,
      last_captured_at = max(coalesce(last_captured_at, excluded.last_captured_at), excluded.last_captured_at);
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `screen_facet_delete` AFTER DELETE ON `screen`
WHEN old.status = 'published' BEGIN
  UPDATE app_facet SET count = count - CASE kind
      WHEN 'pattern' THEN (SELECT count(*) FROM json_each(old.patterns) WHERE value = app_facet.value)
      WHEN 'element' THEN (SELECT count(*) FROM json_each(old.elements) WHERE value = app_facet.value)
      ELSE 1 END
    WHERE app_id = old.app_id AND (
      kind = 'screen'
      OR (kind = 'pattern' AND value IN (SELECT value FROM json_each(old.patterns)))
      OR (kind = 'element' AND value IN (SELECT value FROM json_each(old.elements)))
      OR (kind = 'version' AND value = old.version));
  UPDATE app_facet SET last_captured_at = (
      SELECT max(captured_at) FROM screen
      WHERE app_id = old.app_id AND version = old.version AND status = 'published')
    WHERE app_id = old.app_id AND kind = 'version' AND value = old.version
      AND count > 0 AND last_captured_at <= old.captured_at;
  DELETE FROM app_facet WHERE app_id = old.app_id AND count <= 0;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `screen_facet_update`
AFTER UPDATE OF status, app_id, patterns, elements, version, captured_at ON `screen`
WHEN old.status = 'published' OR new.status = 'published' BEGIN
  UPDATE app_facet SET count = count - CASE kind
      WHEN 'pattern' THEN (SELECT count(*) FROM json_each(old.patterns) WHERE value = app_facet.value)
      WHEN 'element' THEN (SELECT count(*) FROM json_each(old.elements) WHERE value = app_facet.value)
      ELSE 1 END
    WHERE old.status = 'published' AND app_id = old.app_id AND (
      (kind = 'screen' AND (old.status IS NOT new.status OR old.app_id IS NOT new.app_id))
      OR (kind = 'pattern' AND value IN (SELECT value FROM json_each(old.patterns))
        AND (old.status IS NOT new.status OR old.app_id IS NOT new.app_id OR old.patterns IS NOT new.patterns))
      OR (kind = 'element' AND value IN (SELECT value FROM json_each(old.elements))
        AND (old.status IS NOT new.status OR old.app_id IS NOT new.app_id OR old.elements IS NOT new.elements))
      OR (kind = 'version' AND value = old.version
        AND (old.status IS NOT new.status OR old.app_id IS NOT new.app_id
          OR old.version IS NOT new.version OR old.captured_at IS NOT new.captured_at)));
  UPDATE app_facet SET last_captured_at = (
      SELECT max(captured_at) FROM screen
      WHERE app_id = old.app_id AND version = old.version AND status = 'published')
    WHERE old.status = 'published' AND app_id = old.app_id AND kind = 'version'
      AND value = old.version AND count > 0 AND last_captured_at <= old.captured_at
      AND (old.status IS NOT new.status OR old.app_id IS NOT new.app_id
        OR old.version IS NOT new.version OR old.captured_at IS NOT new.captured_at);
  DELETE FROM app_facet WHERE app_id = old.app_id AND count <= 0;
  INSERT INTO app_facet (app_id, kind, value, count, last_captured_at)
    SELECT new.app_id, kind, value, 1, at FROM (
      SELECT 'screen' AS kind, '' AS value, NULL AS at
        WHERE old.status IS NOT 'published' OR old.app_id IS NOT new.app_id
      UNION ALL SELECT 'pattern', value, NULL FROM json_each(new.patterns)
        WHERE old.status IS NOT 'published' OR old.app_id IS NOT new.app_id OR old.patterns IS NOT new.patterns
      UNION ALL SELECT 'element', value, NULL FROM json_each(new.elements)
        WHERE old.status IS NOT 'published' OR old.app_id IS NOT new.app_id OR old.elements IS NOT new.elements
      UNION ALL SELECT 'version', new.version, new.captured_at
        WHERE new.version IS NOT NULL AND (old.status IS NOT 'published' OR old.app_id IS NOT new.app_id
          OR old.version IS NOT new.version OR old.captured_at IS NOT new.captured_at)
    ) WHERE new.status = 'published'
    ON CONFLICT (app_id, kind, value) DO UPDATE SET count = count + 1,
      last_captured_at = max(coalesce(last_captured_at, excluded.last_captured_at), excluded.last_captured_at);
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `flow_facet_insert` AFTER INSERT ON `flow`
WHEN new.status = 'published' BEGIN
  INSERT INTO app_facet (app_id, kind, value, count) VALUES (new.app_id, 'flow', '', 1)
    ON CONFLICT (app_id, kind, value) DO UPDATE SET count = count + 1;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `flow_facet_delete` AFTER DELETE ON `flow`
WHEN old.status = 'published' BEGIN
  UPDATE app_facet SET count = count - 1 WHERE app_id = old.app_id AND kind = 'flow' AND value = '';
  DELETE FROM app_facet WHERE app_id = old.app_id AND kind = 'flow' AND value = '' AND count <= 0;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `flow_facet_update` AFTER UPDATE OF status, app_id ON `flow`
WHEN old.status = 'published' OR new.status = 'published' BEGIN
  UPDATE app_facet SET count = count - 1
    WHERE old.status = 'published' AND app_id = old.app_id AND kind = 'flow' AND value = '';
  DELETE FROM app_facet WHERE app_id = old.app_id AND kind = 'flow' AND value = '' AND count <= 0;
  INSERT INTO app_facet (app_id, kind, value, count)
    SELECT new.app_id, 'flow', '', 1 WHERE new.status = 'published'
    ON CONFLICT (app_id, kind, value) DO UPDATE SET count = count + 1;
END;--> statement-breakpoint
DELETE FROM `app_facet`;--> statement-breakpoint
INSERT INTO `app_facet` (app_id, kind, value, count, last_captured_at)
  SELECT app_id, 'screen', '', count(*), NULL FROM screen WHERE status = 'published' GROUP BY app_id
  UNION ALL SELECT app_id, 'flow', '', count(*), NULL FROM flow WHERE status = 'published' GROUP BY app_id
  UNION ALL SELECT screen.app_id, 'pattern', j.value, count(*), NULL
    FROM screen, json_each(screen.patterns) j WHERE screen.status = 'published' GROUP BY screen.app_id, j.value
  UNION ALL SELECT screen.app_id, 'element', j.value, count(*), NULL
    FROM screen, json_each(screen.elements) j WHERE screen.status = 'published' GROUP BY screen.app_id, j.value
  UNION ALL SELECT app_id, 'version', version, count(*), max(captured_at)
    FROM screen WHERE status = 'published' AND version IS NOT NULL GROUP BY app_id, version;
