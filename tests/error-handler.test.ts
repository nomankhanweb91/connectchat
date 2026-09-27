import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { errorHandler } from '../src/middleware/error-handler';

const secretKeys = ['DB_PASSWORD', 'JWT_SECRET', 'REFRESH_TOKEN_SECRET'] as const;
const previousSecrets = new Map<string, string | undefined>();
const originalConsoleError = console.error;

afterEach(() => {
  for (const key of secretKeys) {
    const previous = previousSecrets.get(key);
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
  previousSecrets.clear();
  console.error = originalConsoleError;
});

describe('error handler diagnostics', () => {
  it('logs useful Error details with secrets redacted and returns a generic response', () => {
    const dbPassword = 'db-password-test-72';
    const jwtSecret = 'jwt-secret-test-83';
    const refreshSecret = 'refresh-secret-test-94';
    const refreshToken = 'r'.repeat(64);
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature123';

    for (const key of secretKeys) previousSecrets.set(key, process.env[key]);
    process.env.DB_PASSWORD = dbPassword;
    process.env.JWT_SECRET = jwtSecret;
    process.env.REFRESH_TOKEN_SECRET = refreshSecret;

    const logged: unknown[][] = [];
    console.error = (...args: unknown[]) => logged.push(args);

    let statusCode = 0;
    let responseBody: unknown;
    const response = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: unknown) {
        responseBody = body;
        return this;
      },
    } as unknown as Response;
    const error = new Error(
      `Query failed password=${dbPassword} secret=${jwtSecret} authorization=Bearer ${jwt} refreshToken=${refreshToken} ${refreshSecret}`,
    );

    errorHandler(error, {} as Request, response, () => undefined);

    assert.equal(statusCode, 500);
    assert.deepEqual(responseBody, {
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
    assert.equal(logged[0]?.[0], 'Unhandled request error:');
    const details = logged[0]?.[1] as { message: string; stack: string };
    assert.match(details.message, /Query failed/);
    assert.match(details.stack, /Error: Query failed/);
    for (const secret of [dbPassword, jwtSecret, refreshSecret, refreshToken, jwt]) {
      assert.equal(JSON.stringify(logged).includes(secret), false, `diagnostics leaked a secret value`);
    }
    assert.match(details.message, /\[REDACTED\]/);
  });
});

