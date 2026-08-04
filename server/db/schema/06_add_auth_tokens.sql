-- ============================================================
-- Migration: Add email verification and password reset tokens
-- Purpose: Support email verification on registration,
--          password reset via secure tokens, and session
--          invalidation on password change
-- ============================================================

-- Add verification token fields
ALTER TABLE `User`
ADD COLUMN `verificationToken` VARCHAR(64) NULL UNIQUE,
ADD COLUMN `verificationTokenExpiry` DATETIME NULL;

-- Add password reset token fields
ALTER TABLE `User`
ADD COLUMN `resetToken` VARCHAR(64) NULL UNIQUE,
ADD COLUMN `resetTokenExpiry` DATETIME NULL;

-- Add field to track when password was last changed
-- (used to invalidate existing sessions when password changes)
ALTER TABLE `User`
ADD COLUMN `passwordChangedAt` DATETIME NULL;

-- Create indexes for token lookups
CREATE INDEX idx_user_verificationToken ON `User`(`verificationToken`);
CREATE INDEX idx_user_resetToken ON `User`(`resetToken`);
CREATE INDEX idx_user_passwordChangedAt ON `User`(`passwordChangedAt`);

-- Note: The `emailVerified` column already exists in the User table.
--       It remains NULL until email is verified, and is set to CURRENT_TIMESTAMP
--       when verification is completed.
