-- =============================================================
-- 03_indexes.sql
-- Creates all performance indexes separately from table definitions.
-- Safe to re-run (uses CREATE INDEX IF NOT EXISTS).
-- =============================================================

USE `quiz_app`;

-- Quiz: look up all quizzes by a teacher
CREATE INDEX IF NOT EXISTS `idx_quiz_teacherId`
  ON `Quiz` (`teacherId`);

-- Question: look up all questions in a quiz
CREATE INDEX IF NOT EXISTS `idx_question_quizId`
  ON `Question` (`quizId`);

-- LiveSession: look up sessions for a quiz or teacher
CREATE INDEX IF NOT EXISTS `idx_livesession_quizId`
  ON `LiveSession` (`quizId`);

CREATE INDEX IF NOT EXISTS `idx_livesession_teacherId`
  ON `LiveSession` (`teacherId`);

-- LiveSession: quickly look up an active session by join code
CREATE INDEX IF NOT EXISTS `idx_livesession_status`
  ON `LiveSession` (`status`);

-- Participant: look up all participants in a session
CREATE INDEX IF NOT EXISTS `idx_participant_sessionId`
  ON `Participant` (`sessionId`);

-- StudentResponse: main lookup patterns
CREATE INDEX IF NOT EXISTS `idx_studentresponse_sessionId`
  ON `StudentResponse` (`sessionId`);

CREATE INDEX IF NOT EXISTS `idx_studentresponse_participantId`
  ON `StudentResponse` (`participantId`);

CREATE INDEX IF NOT EXISTS `idx_studentresponse_questionId`
  ON `StudentResponse` (`questionId`);

-- Composite: get all correct answers for a session in one scan
CREATE INDEX IF NOT EXISTS `idx_studentresponse_session_correct`
  ON `StudentResponse` (`sessionId`, `isCorrect`);
