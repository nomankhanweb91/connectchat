-- Apply once to databases created from the Phase 1 schema before Phase 2.
ALTER TABLE users ADD INDEX idx_users_last_seen (is_active, last_seen);
