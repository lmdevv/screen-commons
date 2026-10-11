ALTER TABLE screen ADD COLUMN visual_fingerprint text;
ALTER TABLE screen ADD COLUMN removal_reason text;
ALTER TABLE flow ADD COLUMN removal_reason text;
ALTER TABLE flow ADD COLUMN submission_id text;
-- Historical rows stay intact. Prevent concurrent uploads by one contributor from creating
-- the same active screen twice; the intake service resolves this race to the existing row.
CREATE TRIGGER screen_retry_guard BEFORE INSERT ON screen
WHEN new.status != 'rejected' AND EXISTS (
  SELECT 1 FROM screen WHERE app_id = new.app_id AND image_key = new.image_key
    AND contributor_id = new.contributor_id AND status != 'rejected'
) BEGIN
  SELECT RAISE(ABORT, 'duplicate_screen');
END;
CREATE UNIQUE INDEX flow_submission_idx ON flow(contributor_id, submission_id)
  WHERE submission_id IS NOT NULL;
