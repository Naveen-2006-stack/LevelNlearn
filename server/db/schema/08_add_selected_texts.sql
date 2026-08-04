-- Migration: 08_add_selected_texts.sql
-- Adds selectedTexts JSON column to StudentResponse to persist answers

ALTER TABLE `StudentResponse`
  ADD COLUMN `selectedTexts` JSON NULL AFTER `reactionTimeMs`;
