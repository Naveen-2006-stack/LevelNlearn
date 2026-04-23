-- =============================================================
-- aiven_setup.sql
-- Run this ENTIRE file in Aiven's Query Editor (defaultdb).
-- Do NOT run 01_create_database.sql — Aiven manages databases.
-- =============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ========================
-- 1. User
-- ========================
CREATE TABLE IF NOT EXISTS `User` (
  `id`            VARCHAR(36)               NOT NULL,
  `name`          VARCHAR(255)              NULL,
  `email`         VARCHAR(255)              NULL,
  `emailVerified` DATETIME                  NULL,
  `password`      VARCHAR(255)              NULL,
  `image`         VARCHAR(255)              NULL,
  `role`          ENUM('TEACHER','STUDENT') NOT NULL DEFAULT 'STUDENT',

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ========================
-- 2. Account (NextAuth)
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
-- 3. Session (NextAuth)
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
-- 4. VerificationToken (NextAuth)
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
  `createdAt`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                              ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),

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
  `options`      JSON         NOT NULL,
  `timeLimit`    INT          NOT NULL DEFAULT 40,
  `basePoints`   INT          NOT NULL DEFAULT 100,
  `orderIndex`   INT          NOT NULL,
  `createdAt`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),

  CONSTRAINT `fk_question_quiz`
    FOREIGN KEY (`quizId`) REFERENCES `Quiz` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ========================
-- 7. LiveSession
-- ========================
CREATE TABLE IF NOT EXISTS `LiveSession` (
  `id`                   VARCHAR(36)                           NOT NULL,
  `joinCode`             VARCHAR(6)                            NOT NULL,
  `quizId`               VARCHAR(36)                           NOT NULL,
  `teacherId`            VARCHAR(36)                           NOT NULL,
  `status`               ENUM('WAITING','ACTIVE','FINISHED')   NOT NULL DEFAULT 'WAITING',
  `currentQuestionIndex` INT                                   NOT NULL DEFAULT 0,
  `startedAt`            DATETIME                              NULL,
  `finishedAt`           DATETIME                              NULL,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_livesession_joinCode` (`joinCode`),

  CONSTRAINT `fk_livesession_quiz`
    FOREIGN KEY (`quizId`) REFERENCES `Quiz` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT `fk_livesession_teacher`
    FOREIGN KEY (`teacherId`) REFERENCES `User` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
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
  `lastActive`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `joinedAt`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_participant_session_device` (`sessionId`, `deviceUuid`),

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
  `isCorrect`      TINYINT(1)   NOT NULL,
  `pointsAwarded`  INT          NOT NULL DEFAULT 0,
  `streakBonus`    INT          NOT NULL DEFAULT 0,
  `answeredAt`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),

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
-- 10. Indexes
-- ========================
CREATE INDEX IF NOT EXISTS `idx_quiz_teacherId`              ON `Quiz` (`teacherId`);
CREATE INDEX IF NOT EXISTS `idx_question_quizId`             ON `Question` (`quizId`);
CREATE INDEX IF NOT EXISTS `idx_livesession_quizId`          ON `LiveSession` (`quizId`);
CREATE INDEX IF NOT EXISTS `idx_livesession_teacherId`       ON `LiveSession` (`teacherId`);
CREATE INDEX IF NOT EXISTS `idx_livesession_status`          ON `LiveSession` (`status`);
CREATE INDEX IF NOT EXISTS `idx_participant_sessionId`       ON `Participant` (`sessionId`);
CREATE INDEX IF NOT EXISTS `idx_studentresponse_sessionId`   ON `StudentResponse` (`sessionId`);
CREATE INDEX IF NOT EXISTS `idx_studentresponse_participantId` ON `StudentResponse` (`participantId`);
CREATE INDEX IF NOT EXISTS `idx_studentresponse_questionId`  ON `StudentResponse` (`questionId`);

SET FOREIGN_KEY_CHECKS = 1;
