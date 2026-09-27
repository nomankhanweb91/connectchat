-- ConnectChat database schema for a fresh, empty selected database.
-- Import this file after selecting the target database in phpMyAdmin.
-- No database name is created or selected by this file.
-- Source order: Phase 1 schema (including the Phase 2 directory index), then Phases 3, 4, and 5.

-- ===== Phase 1 schema (includes the Phase 2 online directory index) =====
CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  username VARCHAR(30) NOT NULL,
  name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  country VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  gender VARCHAR(40) NOT NULL,
  profile_image_url VARCHAR(2048) NULL,
  role ENUM('USER','ADMIN') NOT NULL DEFAULT 'USER',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_users_username (username),
  KEY idx_users_directory (is_active,country,city,gender,created_at),
  KEY idx_users_last_seen (is_active,last_seen),
  KEY idx_users_name (name),
  CONSTRAINT chk_users_username CHECK (username REGEXP '^[A-Za-z0-9_]{4,30}$')
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sessions (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(512) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_used_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  revoked_at DATETIME(3) NULL,
  KEY idx_sessions_user (user_id),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id CHAR(36) PRIMARY KEY,
  session_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  revoked_at DATETIME(3) NULL,
  UNIQUE KEY uq_refresh_token_hash (token_hash),
  KEY idx_refresh_session (session_id),
  KEY idx_refresh_expiry (expires_at),
  CONSTRAINT fk_refresh_session FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Phase 3 and Phase 4 tables are applied by their ordered SQL migrations.

-- ===== Phase 3 messaging =====
-- Apply once to the Phase 2 database after its directory index migration.
-- Conversations store a canonical user pair so A+B and B+A share one unique row.
CREATE TABLE IF NOT EXISTS conversations (
  id CHAR(36) PRIMARY KEY,
  participant_one_id CHAR(36) NOT NULL,
  participant_two_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_conversations_pair (participant_one_id, participant_two_id),
  CONSTRAINT chk_conversations_distinct_users CHECK (participant_one_id < participant_two_id),
  CONSTRAINT fk_conversations_user_one FOREIGN KEY (participant_one_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_conversations_user_two FOREIGN KEY (participant_two_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (conversation_id, user_id),
  KEY idx_conversation_members_user (user_id, conversation_id),
  CONSTRAINT fk_conversation_members_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_conversation_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS messages (
  id CHAR(36) PRIMARY KEY,
  conversation_id CHAR(36) NOT NULL,
  sender_id CHAR(36) NOT NULL,
  message_type ENUM('TEXT') NOT NULL DEFAULT 'TEXT',
  content TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_messages_conversation_created (conversation_id, created_at, id),
  KEY idx_messages_sender_created (sender_id, created_at),
  CONSTRAINT chk_messages_content_length CHECK (CHAR_LENGTH(content) BETWEEN 1 AND 4000),
  CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_sender_member FOREIGN KEY (conversation_id, sender_id) REFERENCES conversation_members(conversation_id, user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS message_receipts (
  message_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  delivered_at DATETIME(3) NULL,
  read_at DATETIME(3) NULL,
  PRIMARY KEY (message_id, user_id),
  KEY idx_message_receipts_unread (user_id, read_at, message_id),
  CONSTRAINT fk_message_receipts_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_message_receipts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ===== Phase 4 image messaging =====
-- Apply once after phase3_messaging.sql. Existing TEXT messages remain unchanged.
CREATE TABLE IF NOT EXISTS uploads (
  id CHAR(36) PRIMARY KEY,
  storage_key VARCHAR(80) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type ENUM('image/jpeg','image/png','image/webp') NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  width INT UNSIGNED NOT NULL,
  height INT UNSIGNED NOT NULL,
  uploaded_by CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_uploads_storage_key (storage_key),
  KEY idx_uploads_uploaded_by_created (uploaded_by,created_at),
  CONSTRAINT chk_uploads_size CHECK (size_bytes > 0),
  CONSTRAINT chk_uploads_dimensions CHECK (width > 0 AND height > 0),
  CONSTRAINT fk_uploads_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

ALTER TABLE messages
  MODIFY COLUMN message_type ENUM('TEXT','IMAGE') NOT NULL DEFAULT 'TEXT',
  ADD COLUMN image_upload_id CHAR(36) NULL AFTER content,
  ADD UNIQUE KEY uq_messages_image_upload (image_upload_id),
  DROP CHECK chk_messages_content_length,
  ADD CONSTRAINT chk_messages_content_length CHECK (
    (message_type='TEXT' AND CHAR_LENGTH(content) BETWEEN 1 AND 4000 AND image_upload_id IS NULL)
    OR (message_type='IMAGE' AND CHAR_LENGTH(content)=0 AND image_upload_id IS NOT NULL)
  ),
  ADD CONSTRAINT fk_messages_image_upload FOREIGN KEY (image_upload_id) REFERENCES uploads(id) ON DELETE CASCADE;

-- ===== Phase 5 blocking and reports =====
-- Apply once after phase4_image_messaging.sql.
CREATE TABLE IF NOT EXISTS blocks (
  id CHAR(36) PRIMARY KEY,
  blocker_user_id CHAR(36) NOT NULL,
  blocked_user_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_blocks_direction (blocker_user_id,blocked_user_id),
  KEY idx_blocks_blocked_by (blocked_user_id,blocker_user_id),
  CONSTRAINT chk_blocks_distinct_users CHECK (blocker_user_id<>blocked_user_id),
  CONSTRAINT fk_blocks_blocker FOREIGN KEY (blocker_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_blocks_blocked FOREIGN KEY (blocked_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reports (
  id CHAR(36) PRIMARY KEY,
  reporter_user_id CHAR(36) NOT NULL,
  target_type ENUM('USER','MESSAGE') NOT NULL,
  reported_user_id CHAR(36) NULL,
  reported_message_id CHAR(36) NULL,
  reason ENUM('SPAM','HARASSMENT','SCAM','ABUSIVE_CONTENT','INAPPROPRIATE_CONTENT','IMPERSONATION','OTHER') NOT NULL,
  description VARCHAR(2000) NULL,
  status ENUM('OPEN','REVIEWED','RESOLVED','DISMISSED') NOT NULL DEFAULT 'OPEN',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_reports_user_duplicate (reporter_user_id,reported_user_id),
  UNIQUE KEY uq_reports_message_duplicate (reporter_user_id,reported_message_id),
  KEY idx_reports_reporter_created (reporter_user_id,created_at,id),
  KEY idx_reports_status_created (status,created_at),
  CONSTRAINT chk_reports_target CHECK (
    (target_type='USER' AND reported_user_id IS NOT NULL AND reported_message_id IS NULL)
    OR (target_type='MESSAGE' AND reported_user_id IS NULL AND reported_message_id IS NOT NULL)
  ),
  CONSTRAINT fk_reports_reporter FOREIGN KEY (reporter_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_reports_reported_user FOREIGN KEY (reported_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_reports_reported_message FOREIGN KEY (reported_message_id) REFERENCES messages(id) ON DELETE CASCADE
) ENGINE=InnoDB;
