-- Migration: 07_add_participant_consent.sql
-- Adds consentAt to Participant to record anti-cheat consent timestamp

ALTER TABLE `Participant`
  ADD COLUMN `consentAt` DATETIME NULL AFTER `joinedAt`;
