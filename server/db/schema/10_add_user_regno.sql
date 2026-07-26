-- Migration: 10_add_user_regno.sql
-- Adds regNo column to User for registration numbers (nullable for migration)

ALTER TABLE `User`
  ADD COLUMN `regNo` VARCHAR(20) NULL UNIQUE AFTER `role`;
