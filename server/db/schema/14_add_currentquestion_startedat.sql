-- Migration: 14_add_currentquestion_startedat.sql
-- Adds a column to LiveSession to persist the timestamp when the current question started

ALTER TABLE `LiveSession`
  ADD COLUMN `currentQuestionStartedAt` DATETIME NULL AFTER `currentQuestionIndex`;
