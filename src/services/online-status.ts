import { env } from '../config/env';

export function isOnline(lastSeen: Date | string | null, now = Date.now()): boolean {
  if (lastSeen === null) return false;
  const timestamp = lastSeen instanceof Date ? lastSeen.getTime() : new Date(lastSeen).getTime();
  return Number.isFinite(timestamp) && timestamp >= now - env.ONLINE_THRESHOLD_MINUTES * 60_000 && timestamp <= now;
}

export function onlineStatusPredicate(column: 'last_seen', online: boolean): string {
  const recent = `${column} >= DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL ${env.ONLINE_THRESHOLD_MINUTES} MINUTE)`;
  return online ? recent : `(${column} IS NULL OR ${column} < DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL ${env.ONLINE_THRESHOLD_MINUTES} MINUTE))`;
}

export function onlineStatusExpression(column: 'last_seen'): string {
  return `CASE WHEN ${onlineStatusPredicate(column, true)} THEN 1 ELSE 0 END`;
}
