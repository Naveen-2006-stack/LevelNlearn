-- =============================================================
-- 04_seed.sql
-- Inserts realistic sample data for local development & testing.
-- Covers one teacher, two students, one quiz, one live session,
-- and sample responses.
-- =============================================================

USE `quiz_app`;

-- -----------------------------------------------
-- 1. Users
-- -----------------------------------------------
-- Password for both users is: Test@1234
-- (bcrypt hash generated externally)
INSERT IGNORE INTO `User` (`id`, `name`, `email`, `password`, `role`) VALUES
  (
    'usr-teacher-001',
    'Ms. Priya',
    'teacher@levelnlearn.com',
    '$2b$10$KIX2hU6TT6m6HdqeY/VTb.xHqUKjuXLVH2glN4lNTEXwpWm7N9B5u',
    'TEACHER'
  ),
  (
    'usr-student-001',
    'Alex Johnson',
    'student1@levelnlearn.com',
    '$2b$10$KIX2hU6TT6m6HdqeY/VTb.xHqUKjuXLVH2glN4lNTEXwpWm7N9B5u',
    'STUDENT'
  ),
  (
    'usr-student-002',
    'Mia Chen',
    'student2@levelnlearn.com',
    '$2b$10$KIX2hU6TT6m6HdqeY/VTb.xHqUKjuXLVH2glN4lNTEXwpWm7N9B5u',
    'STUDENT'
  );


-- -----------------------------------------------
-- 2. Quiz
-- -----------------------------------------------
INSERT IGNORE INTO `Quiz` (`id`, `teacherId`, `title`, `description`) VALUES
  (
    'quiz-001',
    'usr-teacher-001',
    'General Science Quiz',
    'A fun quiz covering basic science topics for class 8.'
  );


-- -----------------------------------------------
-- 3. Questions
-- -----------------------------------------------
INSERT IGNORE INTO `Question`
  (`id`, `quizId`, `questionText`, `questionType`, `options`, `timeLimit`, `basePoints`, `orderIndex`)
VALUES
  (
    'q-001', 'quiz-001',
    'What is the chemical symbol for water?',
    'mcq',
    '[{"text":"H2O","isCorrect":true},{"text":"CO2","isCorrect":false},{"text":"O2","isCorrect":false},{"text":"NaCl","isCorrect":false}]',
    20, 100, 0
  ),
  (
    'q-002', 'quiz-001',
    'The Earth revolves around the Sun.',
    'true_false',
    '[{"text":"True","isCorrect":true},{"text":"False","isCorrect":false}]',
    15, 100, 1
  ),
  (
    'q-003', 'quiz-001',
    'Which of the following are primary colors of light?',
    'multi_select',
    '[{"text":"Red","isCorrect":true},{"text":"Green","isCorrect":true},{"text":"Blue","isCorrect":true},{"text":"Yellow","isCorrect":false}]',
    30, 150, 2
  );


-- -----------------------------------------------
-- 4. LiveSession
-- -----------------------------------------------
INSERT IGNORE INTO `LiveSession`
  (`id`, `joinCode`, `quizId`, `teacherId`, `status`, `currentQuestionIndex`, `startedAt`, `finishedAt`)
VALUES
  (
    'session-001',
    'ABC123',
    'quiz-001',
    'usr-teacher-001',
    'FINISHED',
    2,
    NOW() - INTERVAL 1 HOUR,
    NOW() - INTERVAL 30 MINUTE
  );


-- -----------------------------------------------
-- 5. Participants
-- -----------------------------------------------
INSERT IGNORE INTO `Participant`
  (`id`, `sessionId`, `deviceUuid`, `displayName`, `score`, `streak`, `cheatFlags`)
VALUES
  ('part-001', 'session-001', 'device-aaa-111', 'AlexJ',   250, 2, 0),
  ('part-002', 'session-001', 'device-bbb-222', 'MiaChen', 150, 1, 1);


-- -----------------------------------------------
-- 6. StudentResponses
-- -----------------------------------------------
INSERT IGNORE INTO `StudentResponse`
  (`id`, `sessionId`, `participantId`, `questionId`, `reactionTimeMs`, `isCorrect`, `pointsAwarded`, `streakBonus`)
VALUES
  -- AlexJ answers
  ('sr-001', 'session-001', 'part-001', 'q-001', 4200, 1, 100, 0),
  ('sr-002', 'session-001', 'part-001', 'q-002', 3100, 1, 100, 10),
  ('sr-003', 'session-001', 'part-001', 'q-003', 7800, 1, 150, 20),
  -- MiaChen answers
  ('sr-004', 'session-001', 'part-002', 'q-001', 9000, 0,   0,  0),
  ('sr-005', 'session-001', 'part-002', 'q-002', 5500, 1, 100,  0),
  ('sr-006', 'session-001', 'part-002', 'q-003', 8200, 1, 150, 10);
