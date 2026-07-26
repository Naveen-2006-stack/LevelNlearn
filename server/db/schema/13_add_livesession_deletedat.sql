-- Migration: 13_add_livesession_deletedat.sql
-- Adds soft-delete support to LiveSession

ALTER TABLE `LiveSession`
  ADD COLUMN `deletedAt` DATETIME NULL AFTER `finishedAt`;
