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

