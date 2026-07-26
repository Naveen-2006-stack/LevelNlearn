-- Migration: 09_add_livesession_mode.sql
-- Adds a mode column to LiveSession to support UNANIMOUS/ NORMAL modes

ALTER TABLE `LiveSession`
  ADD COLUMN `mode` VARCHAR(20) NOT NULL DEFAULT 'NORMAL' AFTER `currentQuestionIndex`;
