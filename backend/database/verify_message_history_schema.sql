-- Read-only checks for columns and relationships used by GET /api/conversations/:id/messages.
-- Select the target database in phpMyAdmin before running this script.

SELECT DATABASE() AS selected_database;

SELECT
  expected.table_name,
  expected.column_name,
  actual.column_type,
  CASE WHEN actual.column_name IS NULL THEN 'MISSING' ELSE 'OK' END AS check_result
FROM (
  SELECT 'conversation_members' AS table_name, 'conversation_id' AS column_name
  UNION ALL SELECT 'conversation_members', 'user_id'
  UNION ALL SELECT 'blocks', 'blocker_user_id'
  UNION ALL SELECT 'blocks', 'blocked_user_id'
  UNION ALL SELECT 'messages', 'id'
  UNION ALL SELECT 'messages', 'conversation_id'
  UNION ALL SELECT 'messages', 'sender_id'
  UNION ALL SELECT 'messages', 'message_type'
  UNION ALL SELECT 'messages', 'content'
  UNION ALL SELECT 'messages', 'image_upload_id'
  UNION ALL SELECT 'messages', 'created_at'
  UNION ALL SELECT 'messages', 'updated_at'
  UNION ALL SELECT 'message_receipts', 'message_id'
  UNION ALL SELECT 'message_receipts', 'user_id'
  UNION ALL SELECT 'message_receipts', 'delivered_at'
  UNION ALL SELECT 'message_receipts', 'read_at'
  UNION ALL SELECT 'uploads', 'id'
  UNION ALL SELECT 'uploads', 'mime_type'
  UNION ALL SELECT 'uploads', 'width'
  UNION ALL SELECT 'uploads', 'height'
  UNION ALL SELECT 'uploads', 'size_bytes'
) AS expected
LEFT JOIN information_schema.columns AS actual
  ON actual.table_schema = DATABASE()
  AND actual.table_name = expected.table_name
  AND actual.column_name = expected.column_name
ORDER BY expected.table_name, expected.column_name;

SELECT
  expected.table_name,
  expected.index_name,
  CASE WHEN actual.index_name IS NULL THEN 'MISSING' ELSE 'OK' END AS check_result
FROM (
  SELECT 'messages' AS table_name, 'idx_messages_conversation_created' AS index_name
  UNION ALL SELECT 'messages', 'uq_messages_image_upload'
  UNION ALL SELECT 'message_receipts', 'PRIMARY'
) AS expected
LEFT JOIN information_schema.statistics AS actual
  ON actual.table_schema = DATABASE()
  AND actual.table_name = expected.table_name
  AND actual.index_name = expected.index_name
GROUP BY expected.table_name, expected.index_name, actual.index_name
ORDER BY expected.table_name, expected.index_name;

SELECT
  expected.table_name,
  expected.constraint_name,
  expected.constraint_type,
  CASE WHEN actual.constraint_name IS NULL THEN 'MISSING' ELSE 'OK' END AS check_result
FROM (
  SELECT 'messages' AS table_name, 'fk_messages_image_upload' AS constraint_name, 'FOREIGN KEY' AS constraint_type
  UNION ALL SELECT 'message_receipts', 'fk_message_receipts_message', 'FOREIGN KEY'
  UNION ALL SELECT 'message_receipts', 'fk_message_receipts_user', 'FOREIGN KEY'
) AS expected
LEFT JOIN information_schema.table_constraints AS actual
  ON actual.constraint_schema = DATABASE()
  AND actual.table_name = expected.table_name
  AND actual.constraint_name = expected.constraint_name
  AND actual.constraint_type = expected.constraint_type
ORDER BY expected.table_name, expected.constraint_name;

