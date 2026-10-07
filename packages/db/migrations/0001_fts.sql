-- Full-text search (FTS5). Kept in sync with the base tables by triggers, so every write path
-- (service layer, seed scripts, manual SQL) stays indexed. Each FTS row carries the base row id in
-- an UNINDEXED column; status filtering happens by joining back to the base table.

CREATE VIRTUAL TABLE `screen_fts` USING fts5(
  screen_id UNINDEXED, title, app_name, patterns, elements, tags, source_url, text,
  tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE VIRTUAL TABLE `app_fts` USING fts5(
  app_id UNINDEXED, name, tagline, description, host,
  tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE VIRTUAL TABLE `flow_fts` USING fts5(
  flow_id UNINDEXED, name, description, type, app_name,
  tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER `screen_fts_insert` AFTER INSERT ON `screen` BEGIN
  INSERT INTO screen_fts (screen_id, title, app_name, patterns, elements, tags, source_url, text)
  VALUES (
    new.id, coalesce(new.title, ''),
    coalesce((SELECT name FROM app WHERE id = new.app_id), ''),
    new.patterns, new.elements, new.tags, coalesce(new.source_url, ''), coalesce(new.text, '')
  );
END;
--> statement-breakpoint
CREATE TRIGGER `screen_fts_update` AFTER UPDATE OF title, app_id, patterns, elements, tags, source_url, text ON `screen` BEGIN
  DELETE FROM screen_fts WHERE screen_id = old.id;
  INSERT INTO screen_fts (screen_id, title, app_name, patterns, elements, tags, source_url, text)
  VALUES (
    new.id, coalesce(new.title, ''),
    coalesce((SELECT name FROM app WHERE id = new.app_id), ''),
    new.patterns, new.elements, new.tags, coalesce(new.source_url, ''), coalesce(new.text, '')
  );
END;
--> statement-breakpoint
CREATE TRIGGER `screen_fts_delete` AFTER DELETE ON `screen` BEGIN
  DELETE FROM screen_fts WHERE screen_id = old.id;
END;
--> statement-breakpoint
CREATE TRIGGER `app_fts_insert` AFTER INSERT ON `app` BEGIN
  INSERT INTO app_fts (app_id, name, tagline, description, host)
  VALUES (new.id, new.name, coalesce(new.tagline, ''), coalesce(new.description, ''), coalesce(new.host, ''));
END;
--> statement-breakpoint
CREATE TRIGGER `app_fts_update` AFTER UPDATE OF name, tagline, description, host ON `app` BEGIN
  DELETE FROM app_fts WHERE app_id = old.id;
  INSERT INTO app_fts (app_id, name, tagline, description, host)
  VALUES (new.id, new.name, coalesce(new.tagline, ''), coalesce(new.description, ''), coalesce(new.host, ''));
  UPDATE screen_fts SET app_name = new.name
    WHERE new.name IS NOT old.name AND screen_id IN (SELECT id FROM screen WHERE app_id = new.id);
  UPDATE flow_fts SET app_name = new.name
    WHERE new.name IS NOT old.name AND flow_id IN (SELECT id FROM flow WHERE app_id = new.id);
END;
--> statement-breakpoint
CREATE TRIGGER `app_fts_delete` AFTER DELETE ON `app` BEGIN
  DELETE FROM app_fts WHERE app_id = old.id;
END;
--> statement-breakpoint
CREATE TRIGGER `flow_fts_insert` AFTER INSERT ON `flow` BEGIN
  INSERT INTO flow_fts (flow_id, name, description, type, app_name)
  VALUES (
    new.id, new.name, coalesce(new.description, ''), coalesce(new.type, ''),
    coalesce((SELECT name FROM app WHERE id = new.app_id), '')
  );
END;
--> statement-breakpoint
CREATE TRIGGER `flow_fts_update` AFTER UPDATE OF name, description, type, app_id ON `flow` BEGIN
  DELETE FROM flow_fts WHERE flow_id = old.id;
  INSERT INTO flow_fts (flow_id, name, description, type, app_name)
  VALUES (
    new.id, new.name, coalesce(new.description, ''), coalesce(new.type, ''),
    coalesce((SELECT name FROM app WHERE id = new.app_id), '')
  );
END;
--> statement-breakpoint
CREATE TRIGGER `flow_fts_delete` AFTER DELETE ON `flow` BEGIN
  DELETE FROM flow_fts WHERE flow_id = old.id;
END;
