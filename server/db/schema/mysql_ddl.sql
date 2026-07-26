-- =============================================================
-- LevelNLearn – MySQL 8.0 DDL
-- Generated from prisma/schema.prisma
-- =============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ========================
-- 1. User
-- ========================
CREATE TABLE IF NOT EXISTS `User` (
  `id`                     VARCHAR(36)                       NOT NULL,
  `name`                   VARCHAR(255)                      NULL,
  `email`                  VARCHAR(255)                      NULL,
  `emailVerified`          DATETIME                          NULL,
  `password`               VARCHAR(255)                      NULL,
  `image`                  VARCHAR(2048)                     NULL,
  `role`                   ENUM('TEACHER','STUDENT','ADMIN') NOT NULL DEFAULT 'STUDENT',
  `regNo`                  VARCHAR(20)                       NULL,
  `isGhost`                TINYINT(1)                        NOT NULL DEFAULT 0,
  `verificationToken`      VARCHAR(512)                      NULL,
  `verificationTokenExpiry` DATETIME                         NULL,
  `resetToken`             VARCHAR(512)                      NULL,
  `resetTokenExpiry`       DATETIME                          NULL,
  `passwordChangedAt`      DATETIME                          NULL,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_email` (`email`),
  UNIQUE KEY `uq_user_regNo` (`regNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================
-- 2. Account  (NextAuth)
-- ========================
CREATE TABLE IF NOT EXISTS `Account` (
  `id`                VARCHAR(36)   NOT NULL,
  `userId`            VARCHAR(36)   NOT NULL,
  `type`              VARCHAR(255)  NOT NULL,
  `provider`          VARCHAR(255)  NOT NULL,
  `providerAccountId` VARCHAR(255)  NOT NULL,
  `refresh_token`     TEXT          NULL,
  `access_token`      TEXT          NULL,
  `expires_at`        INT           NULL,
  `token_type`        VARCHAR(255)  NULL,
  `scope`             VARCHAR(255)  NULL,
  `id_token`          TEXT          NULL,
  `session_state`     VARCHAR(255)  NULL,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_account_provider` (`provider`, `providerAccountId`),

  CONSTRAINT `fk_account_user`
    FOREIGN KEY (`userId`) REFERENCES `User` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================
-- 3. Session  (NextAuth)
-- ========================
CREATE TABLE IF NOT EXISTS `Session` (
  `id`           VARCHAR(36)   NOT NULL,
  `sessionToken` VARCHAR(512)  NOT NULL,
  `userId`       VARCHAR(36)   NOT NULL,
  `expires`      DATETIME      NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_session_token` (`sessionToken`),

  CONSTRAINT `fk_session_user`
    FOREIGN KEY (`userId`) REFERENCES `User` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================
-- 4. VerificationToken  (NextAuth)
-- ========================
CREATE TABLE IF NOT EXISTS `VerificationToken` (
  `identifier` VARCHAR(255) NOT NULL,
  `token`      VARCHAR(512) NOT NULL,
  `expires`    DATETIME     NOT NULL,

  UNIQUE KEY `uq_verificationtoken_token` (`token`),
  UNIQUE KEY `uq_verificationtoken_identifier_token` (`identifier`, `token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================
-- 5. Quiz
-- ========================
CREATE TABLE IF NOT EXISTS `Quiz` (
  `id`          VARCHAR(36)   NOT NULL,
  `teacherId`   VARCHAR(36)   NOT NULL,
  `title`       VARCHAR(255)  NOT NULL,
  `description` TEXT          NULL,
  `timerBasedMarking` TINYINT(1) NOT NULL DEFAULT 1,
  `testMode`    TINYINT(1)    NOT NULL DEFAULT 0,
  `createdAt`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  KEY `idx_quiz_teacherId` (`teacherId`),

  CONSTRAINT `fk_quiz_teacher`
    FOREIGN KEY (`teacherId`) REFERENCES `User` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================
-- 6. Question
-- ========================
CREATE TABLE IF NOT EXISTS `Question` (
  `id`           VARCHAR(36)  NOT NULL,
  `quizId`       VARCHAR(36)  NOT NULL,
  `questionText` TEXT         NOT NULL,
  `questionType` VARCHAR(50)  NOT NULL DEFAULT 'mcq',
  `type`         ENUM('SINGLE','MULTIPLE') NOT NULL DEFAULT 'SINGLE',
  `options`      JSON         NOT NULL,
  `timeLimit`    INT          NOT NULL DEFAULT 40,
  `timeLimitSeconds` INT      NOT NULL DEFAULT 30,
  `basePoints`   INT          NOT NULL DEFAULT 100,
  `imageUrl`     VARCHAR(255) NULL,
  `orderIndex`   INT          NOT NULL,
  `createdAt`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  KEY `idx_question_quizId` (`quizId`),

  CONSTRAINT `fk_question_quiz`
    FOREIGN KEY (`quizId`) REFERENCES `Quiz` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================
-- 7. LiveSession
-- ========================
CREATE TABLE IF NOT EXISTS `LiveSession` (
  `id`                   VARCHAR(36)                         NOT NULL,
  `joinCode`             VARCHAR(6)                          NOT NULL,
  `quizId`               VARCHAR(36)                         NOT NULL,
  `teacherId`            VARCHAR(36)                         NOT NULL,
  `status`               ENUM('WAITING','LOBBY','ACTIVE','FINISHED') NOT NULL DEFAULT 'WAITING',
  `mode`                 ENUM('TEACHER_PACED','STUDENT_PACED','UNANIMOUS') NOT NULL DEFAULT 'TEACHER_PACED',
  `currentQuestionIndex` INT                                 NOT NULL DEFAULT 0,
  `startedAt`            DATETIME                            NULL,
  `finishedAt`           DATETIME                            NULL,
  `currentQuestionStartedAt` DATETIME                        NULL,
  `deletedAt`            DATETIME                            NULL,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_livesession_joinCode` (`joinCode`),
  KEY `idx_livesession_quizId`    (`quizId`),
  KEY `idx_livesession_teacherId` (`teacherId`),

  CONSTRAINT `fk_livesession_quiz`
    FOREIGN KEY (`quizId`) REFERENCES `Quiz` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT `fk_livesession_teacher`
    FOREIGN KEY (`teacherId`) REFERENCES `User` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================
-- 8. Participant
-- ========================
CREATE TABLE IF NOT EXISTS `Participant` (
  `id`          VARCHAR(36)   NOT NULL,
  `sessionId`   VARCHAR(36)   NOT NULL,
  `deviceUuid`  VARCHAR(36)   NOT NULL,
  `displayName` VARCHAR(255)  NOT NULL,
  `score`       INT           NOT NULL DEFAULT 0,
  `streak`      INT           NOT NULL DEFAULT 0,
  `cheatFlags`  INT           NOT NULL DEFAULT 0,
  `status`      ENUM('JOINED','IN_PROGRESS','SUBMITTED','DISQUALIFIED') NOT NULL DEFAULT 'JOINED',
  `submittedAt` DATETIME      NULL,
  `finalScore`  INT           NULL,
  `consentAt`   DATETIME      NULL,
  `lastActive`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `joinedAt`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_participant_session_device` (`sessionId`, `deviceUuid`),
  KEY `idx_participant_sessionId` (`sessionId`),

  CONSTRAINT `fk_participant_session`
    FOREIGN KEY (`sessionId`) REFERENCES `LiveSession` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================
-- 9. StudentResponse
-- ========================
CREATE TABLE IF NOT EXISTS `StudentResponse` (
  `id`             VARCHAR(36)  NOT NULL,
  `sessionId`      VARCHAR(36)  NOT NULL,
  `participantId`  VARCHAR(36)  NOT NULL,
  `questionId`     VARCHAR(36)  NOT NULL,
  `reactionTimeMs` INT          NOT NULL,
  `selectedTexts`  JSON         NULL,
  `isCorrect`      TINYINT(1)   NOT NULL,
  `pointsAwarded`  INT          NOT NULL DEFAULT 0,
  `streakBonus`    INT          NOT NULL DEFAULT 0,
  `answeredAt`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_studentresponse_session_participant_question` (`sessionId`, `participantId`, `questionId`),
  KEY `idx_studentresponse_sessionId`     (`sessionId`),
  KEY `idx_studentresponse_participantId` (`participantId`),
  KEY `idx_studentresponse_questionId`    (`questionId`),

  CONSTRAINT `fk_studentresponse_session`
    FOREIGN KEY (`sessionId`) REFERENCES `LiveSession` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT `fk_studentresponse_participant`
    FOREIGN KEY (`participantId`) REFERENCES `Participant` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT `fk_studentresponse_question`
    FOREIGN KEY (`questionId`) REFERENCES `Question` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================
-- 10. Feedback
-- ========================
CREATE TABLE IF NOT EXISTS `Feedback` (
  `id`          VARCHAR(36)  NOT NULL,
  `userId`      VARCHAR(36)  NOT NULL,
  `rating`      INT          NOT NULL,
  `message`     TEXT         NOT NULL,
  `createdAt`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  KEY `idx_feedback_userId` (`userId`),

  CONSTRAINT `fk_feedback_user`
    FOREIGN KEY (`userId`) REFERENCES `User` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================
-- 11. Violation  (anti-cheat log)
-- ========================
CREATE TABLE IF NOT EXISTS `Violation` (
  `id`            VARCHAR(36)   NOT NULL,
  `sessionId`     VARCHAR(36)   NOT NULL,
  `participantId` VARCHAR(36)   NULL,
  `violationType` VARCHAR(255)  NOT NULL DEFAULT 'unknown',
  `source`        VARCHAR(50)   NOT NULL DEFAULT 'live',
  `payload`       JSON          NULL,
  `createdAt`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  KEY `idx_violation_sessionId`     (`sessionId`),
  KEY `idx_violation_participantId` (`participantId`),

  CONSTRAINT `fk_violation_session`
    FOREIGN KEY (`sessionId`) REFERENCES `LiveSession` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT `fk_violation_participant`
    FOREIGN KEY (`participantId`) REFERENCES `Participant` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ========================
-- Default Admin Account
-- Email   : quizsrm@gmail.com
-- Password: Admin@LevelNLearn2024   (change after first login!)
-- ========================
INSERT IGNORE INTO `User` (
  `id`, `name`, `email`, `role`, `emailVerified`, `password`, `isGhost`
) VALUES (
  'admin-00000000-0000-0000-0000-000000000001',
  'QuizSrm Admin',
  'quizsrm@gmail.com',
  'ADMIN',
  NOW(),
  '$2b$10$TYL8YVaNb1O3WYZsK83r0.hYEG4TnO8yhCfXIDB0MvKEnjdTGd3ee',
  0
);

-- End of DDL
