-- =============================================================
-- 05_queries.sql
-- Useful admin, debug, and analytics queries for LevelNLearn.
-- =============================================================

USE `quiz_app`;

-- -----------------------------------------------
-- SECTION 1: Leaderboard for a session
-- -----------------------------------------------
-- Replace 'session-001' with the target session ID.
SELECT
  p.displayName,
  p.score,
  p.streak,
  p.cheatFlags,
  COUNT(sr.id)                                       AS totalAnswers,
  SUM(sr.isCorrect)                                  AS correctAnswers,
  ROUND(AVG(sr.reactionTimeMs))                      AS avgReactionMs,
  RANK() OVER (ORDER BY p.score DESC)                AS `rank`
FROM `Participant` p
LEFT JOIN `StudentResponse` sr
  ON sr.participantId = p.id
WHERE p.sessionId = 'session-001'
GROUP BY p.id, p.displayName, p.score, p.streak, p.cheatFlags
ORDER BY p.score DESC;


-- -----------------------------------------------
-- SECTION 2: Question difficulty breakdown
-- -----------------------------------------------
-- Shows correct vs incorrect answer ratio per question.
SELECT
  q.orderIndex + 1                                        AS questionNumber,
  SUBSTRING(q.questionText, 1, 60)                        AS questionPreview,
  q.questionType,
  COUNT(sr.id)                                            AS totalAttempts,
  SUM(sr.isCorrect)                                       AS correctCount,
  COUNT(sr.id) - SUM(sr.isCorrect)                        AS incorrectCount,
  ROUND(SUM(sr.isCorrect) / COUNT(sr.id) * 100, 1)        AS correctPct,
  ROUND(AVG(sr.reactionTimeMs) / 1000, 2)                 AS avgTimeSec
FROM `Question` q
LEFT JOIN `StudentResponse` sr ON sr.questionId = q.id
WHERE q.quizId = 'quiz-001'
GROUP BY q.id, q.orderIndex, q.questionText, q.questionType
ORDER BY q.orderIndex ASC;


-- -----------------------------------------------
-- SECTION 3: All sessions for a teacher (with stats)
-- -----------------------------------------------
SELECT
  ls.id                     AS sessionId,
  ls.joinCode,
  ls.status,
  qz.title                  AS quizTitle,
  ls.startedAt,
  ls.finishedAt,
  COUNT(DISTINCT p.id)      AS participantCount,
  MAX(p.score)              AS topScore,
  ROUND(AVG(p.score), 1)    AS avgScore,
  SUM(p.cheatFlags)         AS totalCheatFlags
FROM `LiveSession` ls
JOIN `Quiz` qz         ON qz.id = ls.quizId
LEFT JOIN `Participant` p ON p.sessionId = ls.id
WHERE ls.teacherId = 'usr-teacher-001'
GROUP BY ls.id, ls.joinCode, ls.status, qz.title, ls.startedAt, ls.finishedAt
ORDER BY ls.startedAt DESC;


-- -----------------------------------------------
-- SECTION 4: Active sessions right now
-- -----------------------------------------------
SELECT
  ls.id,
  ls.joinCode,
  u.name                    AS teacherName,
  qz.title                  AS quizTitle,
  ls.currentQuestionIndex,
  ls.startedAt,
  COUNT(p.id)               AS liveParticipants
FROM `LiveSession` ls
JOIN `User` u         ON u.id = ls.teacherId
JOIN `Quiz` qz        ON qz.id = ls.quizId
LEFT JOIN `Participant` p ON p.sessionId = ls.id
WHERE ls.status = 'ACTIVE'
GROUP BY ls.id, ls.joinCode, u.name, qz.title, ls.currentQuestionIndex, ls.startedAt;


-- -----------------------------------------------
-- SECTION 5: Flagged / cheat-suspicious participants
-- -----------------------------------------------
SELECT
  p.displayName,
  p.cheatFlags,
  p.score,
  ls.joinCode             AS sessionCode,
  ls.finishedAt           AS sessionEndTime
FROM `Participant` p
JOIN `LiveSession` ls ON ls.id = p.sessionId
WHERE p.cheatFlags > 0
ORDER BY p.cheatFlags DESC, ls.finishedAt DESC;


-- -----------------------------------------------
-- SECTION 6: Per-student drill-down (all responses)
-- -----------------------------------------------
-- Replace 'part-001' with the target participant ID.
SELECT
  q.orderIndex + 1            AS questionNumber,
  SUBSTRING(q.questionText, 1, 60) AS question,
  sr.isCorrect,
  sr.pointsAwarded,
  sr.streakBonus,
  ROUND(sr.reactionTimeMs / 1000, 2) AS timeTakenSec,
  sr.answeredAt
FROM `StudentResponse` sr
JOIN `Question` q ON q.id = sr.questionId
WHERE sr.participantId = 'part-001'
ORDER BY q.orderIndex ASC;


-- -----------------------------------------------
-- SECTION 7: Database health – row counts per table
-- -----------------------------------------------
SELECT 'User'            AS tableName, COUNT(*) AS rows FROM `User`            UNION ALL
SELECT 'Account',                      COUNT(*)          FROM `Account`          UNION ALL
SELECT 'Session',                      COUNT(*)          FROM `Session`          UNION ALL
SELECT 'VerificationToken',            COUNT(*)          FROM `VerificationToken` UNION ALL
SELECT 'Quiz',                         COUNT(*)          FROM `Quiz`             UNION ALL
SELECT 'Question',                     COUNT(*)          FROM `Question`         UNION ALL
SELECT 'LiveSession',                  COUNT(*)          FROM `LiveSession`      UNION ALL
SELECT 'Participant',                  COUNT(*)          FROM `Participant`      UNION ALL
SELECT 'StudentResponse',              COUNT(*)          FROM `StudentResponse`;
