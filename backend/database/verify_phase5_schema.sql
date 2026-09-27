-- Read-only verification for the currently selected MySQL database.
-- Select the target database in phpMyAdmin before importing this file.

SELECT DATABASE() AS selected_database;

SELECT
  expected.table_name,
  CASE WHEN actual.table_name IS NULL THEN 'MISSING' ELSE 'OK' END AS check_result
FROM (
  SELECT 'users' AS table_name
  UNION ALL SELECT 'sessions'
  UNION ALL SELECT 'refresh_tokens'
  UNION ALL SELECT 'conversations'
  UNION ALL SELECT 'conversation_members'
  UNION ALL SELECT 'messages'
  UNION ALL SELECT 'message_receipts'
  UNION ALL SELECT 'uploads'
  UNION ALL SELECT 'blocks'
  UNION ALL SELECT 'reports'
) AS expected
LEFT JOIN information_schema.tables AS actual
  ON actual.table_schema = DATABASE()
  AND actual.table_name = expected.table_name
ORDER BY expected.table_name;

SELECT
  expected.table_name,
  expected.index_name,
  CASE WHEN COUNT(actual.index_name) = 0 THEN 'MISSING' ELSE 'OK' END AS check_result
FROM (
  SELECT 'blocks' AS table_name, 'PRIMARY' AS index_name, 0 AS non_unique
  UNION ALL SELECT 'blocks', 'uq_blocks_direction', 0
  UNION ALL SELECT 'blocks', 'idx_blocks_blocked_by', 1
  UNION ALL SELECT 'reports', 'PRIMARY', 0
  UNION ALL SELECT 'reports', 'uq_reports_user_duplicate', 0
  UNION ALL SELECT 'reports', 'uq_reports_message_duplicate', 0
  UNION ALL SELECT 'reports', 'idx_reports_reporter_created', 1
  UNION ALL SELECT 'reports', 'idx_reports_status_created', 1
) AS expected
LEFT JOIN information_schema.statistics AS actual
  ON actual.table_schema = DATABASE()
  AND actual.table_name = expected.table_name
  AND actual.index_name = expected.index_name
  AND actual.non_unique = expected.non_unique
GROUP BY expected.table_name, expected.index_name
ORDER BY expected.table_name, expected.index_name;

SELECT
  expected.table_name,
  expected.constraint_name,
  expected.constraint_type,
  CASE WHEN actual.constraint_name IS NULL THEN 'MISSING' ELSE 'OK' END AS check_result
FROM (
  SELECT 'blocks' AS table_name, 'chk_blocks_distinct_users' AS constraint_name, 'CHECK' AS constraint_type
  UNION ALL SELECT 'blocks', 'fk_blocks_blocker', 'FOREIGN KEY'
  UNION ALL SELECT 'blocks', 'fk_blocks_blocked', 'FOREIGN KEY'
  UNION ALL SELECT 'reports', 'chk_reports_target', 'CHECK'
  UNION ALL SELECT 'reports', 'fk_reports_reporter', 'FOREIGN KEY'
  UNION ALL SELECT 'reports', 'fk_reports_reported_user', 'FOREIGN KEY'
  UNION ALL SELECT 'reports', 'fk_reports_reported_message', 'FOREIGN KEY'
) AS expected
LEFT JOIN information_schema.table_constraints AS actual
  ON actual.constraint_schema = DATABASE()
  AND actual.table_name = expected.table_name
  AND actual.constraint_name = expected.constraint_name
  AND actual.constraint_type = expected.constraint_type
ORDER BY expected.table_name, expected.constraint_name;
