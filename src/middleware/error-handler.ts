import type { ErrorRequestHandler } from 'express';
import { HttpError } from '../utils/http-error';

const sensitiveDiagnosticValue = /\b(password|passwd|secret|token|authorization|cookie|refresh[_-]?token|access[_-]?token)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi;
const jwtValue = /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const bearerValue = /\bBearer\s+[^\s,;]+/gi;
const longOpaqueValue = /\b[A-Za-z0-9_-]{48,}\b/g;

function redactDiagnostic(value: string): string {
  let safe = value;

  // Error messages can occasionally include a value from a failed config/query. Remove
  // secrets configured in this process before applying format-based token redaction.
  for (const [key, secret] of Object.entries(process.env)) {
    if (secret && /(?:PASSWORD|SECRET)$/i.test(key)) {
      safe = safe.split(secret).join('[REDACTED]');
    }
  }

  safe = safe
    .replace(bearerValue, 'Bearer [REDACTED]')
    .replace(jwtValue, '[REDACTED_JWT]')
    .replace(sensitiveDiagnosticValue, '$1$2[REDACTED]')
    // Refresh tokens are opaque random strings rather than necessarily JWTs.
    .replace(longOpaqueValue, '[REDACTED_TOKEN]');

  return safe;
}

function logUnexpectedError(error: unknown): void {
  if (error instanceof Error) {
    console.error('Unhandled request error:', {
      name: redactDiagnostic(error.name),
      message: redactDiagnostic(error.message),
      stack: error.stack ? redactDiagnostic(error.stack) : undefined,
    });
    return;
  }

  console.error('Unhandled request error:', {
    message: redactDiagnostic(String(error)),
  });
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ success: false, message: error.message, code: error.code });
    return;
  }

  const e = (typeof error === 'object' && error !== null ? error : {}) as { code?: string; type?: string };
  if (e.type === 'entity.parse.failed') {
    res.status(400).json({ success: false, message: 'Invalid JSON body', code: 'INVALID_JSON' });
    return;
  }
  if (e.type === 'entity.too.large') {
    res.status(413).json({ success: false, message: 'Request body too large', code: 'BODY_TOO_LARGE' });
    return;
  }
  if (e.code === 'ER_DUP_ENTRY') {
    res.status(409).json({ success: false, message: 'Username is already taken', code: 'DUPLICATE_USERNAME' });
    return;
  }

  logUnexpectedError(error);
  res.status(500).json({ success: false, message: 'Internal server error', code: 'INTERNAL_ERROR' });
};

