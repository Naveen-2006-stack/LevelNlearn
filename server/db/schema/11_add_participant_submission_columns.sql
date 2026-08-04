-- Migration: 11_add_participant_submission_columns.sql
-- Adds submission tracking columns to Participant

ALTER TABLE `Participant`
  ADD COLUMN `submittedAt` DATETIME NULL AFTER `lastActive`,
  ADD COLUMN `finalScore` INT NULL AFTER `submittedAt`,
  ADD COLUMN `status` ENUM('JOINED','IN_PROGRESS','SUBMITTED','DISQUALIFIED') NOT NULL DEFAULT 'JOINED' AFTER `finalScore`;
