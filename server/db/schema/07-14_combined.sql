-- Combined Migrations: 07 → 14
-- Run these in a dev/staging DB. Backup first.

-- 07_add_participant_consent.sql
-- Adds consentAt to Participant to record anti-cheat consent timestamp
ALTER TABLE `Participant`
  ADD COLUMN `consentAt` DATETIME NULL AFTER `joinedAt`;

-- 08_add_selected_texts.sql
-- Adds selectedTexts JSON column to StudentResponse to persist answers
ALTER TABLE `StudentResponse`
  ADD COLUMN `selectedTexts` JSON NULL AFTER `reactionTimeMs`;

-- 09_add_livesession_mode.sql
-- Adds a mode column to LiveSession to support UNANIMOUS/ NORMAL modes
ALTER TABLE `LiveSession`
  ADD COLUMN `mode` VARCHAR(20) NOT NULL DEFAULT 'NORMAL' AFTER `currentQuestionIndex`;

-- 10_add_user_regno.sql
-- Adds regNo column to User for registration numbers (nullable for migration)
ALTER TABLE `User`
  ADD COLUMN `regNo` VARCHAR(20) NULL UNIQUE AFTER `role`;

-- 11_add_participant_submission_columns.sql
-- Adds submission tracking columns to Participant
ALTER TABLE `Participant`
  ADD COLUMN `submittedAt` DATETIME NULL AFTER `lastActive`,
  ADD COLUMN `finalScore` INT NULL AFTER `submittedAt`,
  ADD COLUMN `status` ENUM('JOINED','IN_PROGRESS','SUBMITTED','DISQUALIFIED') NOT NULL DEFAULT 'JOINED' AFTER `finalScore`;

-- 12_add_studentresponse_unique.sql
-- Adds unique constraint to prevent duplicate StudentResponse entries per participant+question
ALTER TABLE `StudentResponse`
  ADD UNIQUE KEY `uq_response_participant_question` (`sessionId`, `participantId`, `questionId`);

-- 13_add_livesession_deletedat.sql
-- Adds soft-delete support to LiveSession
ALTER TABLE `LiveSession`
  ADD COLUMN `deletedAt` DATETIME NULL AFTER `finishedAt`;

-- 14_add_currentquestion_startedat.sql
-- Adds a column to LiveSession to persist the timestamp when the current question started
ALTER TABLE `LiveSession`
  ADD COLUMN `currentQuestionStartedAt` DATETIME NULL AFTER `currentQuestionIndex`;
