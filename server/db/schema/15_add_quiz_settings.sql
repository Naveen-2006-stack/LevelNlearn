-- =============================================================
-- 15_add_quiz_settings.sql
-- Adds persistent quiz-level settings for timer scoring and test mode.
-- =============================================================

ALTER TABLE `Quiz`
  ADD COLUMN `timerBasedMarking` TINYINT(1) NOT NULL DEFAULT 1 AFTER `description`,
  ADD COLUMN `testMode` TINYINT(1) NOT NULL DEFAULT 0 AFTER `timerBasedMarking`;