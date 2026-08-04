-- Migration: 12_add_studentresponse_unique.sql
-- Adds unique constraint to prevent duplicate StudentResponse entries per participant+question

ALTER TABLE `StudentResponse`
  ADD UNIQUE KEY `uq_response_participant_question` (`sessionId`, `participantId`, `questionId`);
