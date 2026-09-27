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

