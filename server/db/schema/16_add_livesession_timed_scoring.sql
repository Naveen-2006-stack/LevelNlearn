-- =============================================================
-- 16_add_livesession_timed_scoring.sql
-- Adds timedScoring flag to LiveSession.
-- When 0: no timer shown to participants, no server-side time enforcement.
-- When 1 (default): current behaviour — countdown timer is shown.
-- =============================================================

ALTER TABLE `LiveSession`
  ADD COLUMN `timedScoring` TINYINT(1) NOT NULL DEFAULT 1
  AFTER `mode`;
