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
