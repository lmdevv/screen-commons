-- Re-runnable: previews migrate the shared dev D1 by file name, so a renumbered file runs again.
-- Rows are keyed by the flow's rowid: FTS5 looks up only by rowid, so a flow_id filter scans the table.
DROP TRIGGER IF EXISTS `flow_fts_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `flow_fts_update`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `flow_fts_delete`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `flow_fts_step_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `flow_fts_step_update`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `flow_fts_step_delete`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `flow_fts_screen_title`;
--> statement-breakpoint
DROP TABLE IF EXISTS `flow_fts`;
--> statement-breakpoint
CREATE VIRTUAL TABLE `flow_fts` USING fts5(
  flow_id UNINDEXED, name, description, type, app_name, steps,
  tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint
INSERT INTO flow_fts (rowid, flow_id, name, description, type, app_name, steps)
  SELECT f.rowid, f.id, f.name, coalesce(f.description, ''), coalesce(f.type, ''),
    coalesce((SELECT name FROM app WHERE id = f.app_id), ''),
    coalesce((
      SELECT group_concat(part, ' ') FROM (
        SELECT nullif(trim(coalesce(fs.label, '') || ' ' || coalesce(s.title, '')), '') AS part
        FROM flow_step fs JOIN screen s ON s.id = fs.screen_id
        WHERE fs.flow_id = f.id ORDER BY fs.position
      )
    ), '')
  FROM flow f;
--> statement-breakpoint
CREATE TRIGGER `flow_fts_insert` AFTER INSERT ON `flow` BEGIN
  DELETE FROM flow_fts WHERE rowid = new.rowid;
  INSERT INTO flow_fts (rowid, flow_id, name, description, type, app_name, steps)
  VALUES (
    new.rowid, new.id, new.name, coalesce(new.description, ''), coalesce(new.type, ''),
    coalesce((SELECT name FROM app WHERE id = new.app_id), ''), ''
  );
END;
--> statement-breakpoint
CREATE TRIGGER `flow_fts_update` AFTER UPDATE OF name, description, type, app_id ON `flow` BEGIN
  UPDATE flow_fts SET
    name = new.name, description = coalesce(new.description, ''),
    type = coalesce(new.type, ''), app_name = coalesce((SELECT name FROM app WHERE id = new.app_id), '')
  WHERE rowid = new.rowid AND flow_id = new.id;
END;
--> statement-breakpoint
CREATE TRIGGER `flow_fts_delete` AFTER DELETE ON `flow` BEGIN
  DELETE FROM flow_fts WHERE rowid = old.rowid AND flow_id = old.id;
END;
--> statement-breakpoint
CREATE TRIGGER `flow_fts_step_insert` AFTER INSERT ON `flow_step`
WHEN new.label IS NOT NULL OR (SELECT title FROM screen WHERE id = new.screen_id) IS NOT NULL BEGIN
  UPDATE flow_fts SET steps = coalesce((
    SELECT group_concat(part, ' ') FROM (
      SELECT nullif(trim(coalesce(fs.label, '') || ' ' || coalesce(s.title, '')), '') AS part
      FROM flow_step fs JOIN screen s ON s.id = fs.screen_id
      WHERE fs.flow_id = flow_fts.flow_id ORDER BY fs.position
    )
  ), '')
  WHERE rowid = (SELECT rowid FROM flow WHERE id = new.flow_id) AND flow_id = new.flow_id;
END;
--> statement-breakpoint
CREATE TRIGGER `flow_fts_step_update` AFTER UPDATE OF flow_id, position, screen_id, label ON `flow_step` BEGIN
  UPDATE flow_fts SET steps = coalesce((
    SELECT group_concat(part, ' ') FROM (
      SELECT nullif(trim(coalesce(fs.label, '') || ' ' || coalesce(s.title, '')), '') AS part
      FROM flow_step fs JOIN screen s ON s.id = fs.screen_id
      WHERE fs.flow_id = flow_fts.flow_id ORDER BY fs.position
    )
  ), '')
  WHERE rowid IN (SELECT rowid FROM flow WHERE id IN (old.flow_id, new.flow_id));
END;
--> statement-breakpoint
CREATE TRIGGER `flow_fts_step_delete` AFTER DELETE ON `flow_step` BEGIN
  UPDATE flow_fts SET steps = coalesce((
    SELECT group_concat(part, ' ') FROM (
      SELECT nullif(trim(coalesce(fs.label, '') || ' ' || coalesce(s.title, '')), '') AS part
      FROM flow_step fs JOIN screen s ON s.id = fs.screen_id
      WHERE fs.flow_id = flow_fts.flow_id ORDER BY fs.position
    )
  ), '')
  WHERE rowid = (SELECT rowid FROM flow WHERE id = old.flow_id) AND flow_id = old.flow_id
    AND steps != '';
END;
--> statement-breakpoint
CREATE TRIGGER `flow_fts_screen_title` AFTER UPDATE OF title ON `screen`
WHEN new.title IS NOT old.title BEGIN
  UPDATE flow_fts SET steps = coalesce((
    SELECT group_concat(part, ' ') FROM (
      SELECT nullif(trim(coalesce(fs.label, '') || ' ' || coalesce(s.title, '')), '') AS part
      FROM flow_step fs JOIN screen s ON s.id = fs.screen_id
      WHERE fs.flow_id = flow_fts.flow_id ORDER BY fs.position
    )
  ), '')
  WHERE rowid IN (SELECT f.rowid FROM flow f JOIN flow_step fs ON fs.flow_id = f.id WHERE fs.screen_id = new.id);
END;
