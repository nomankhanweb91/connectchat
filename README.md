# ConnectChat backend (Phase 1)

Production-oriented API foundation for registration, authentication, profile management and a paginated user directory. This phase does not include messaging, sockets, media upload, a client app or an admin UI.

## Requirements

- Node.js 20 or newer and npm
- MySQL 8.0+ (the schema uses MySQL 8 collations and enforced check constraints)
- A MySQL account limited to the ConnectChat database

## Install and configure

```sh
npm install
mysql -u root -p < backend/database/schema.sql
cp .env.example .env
```

Set every value in `.env`, especially `DATABASE_PASSWORD`, `JWT_SECRET`, and `REFRESH_TOKEN_SECRET`. Generate independent secrets with `openssl rand -base64 48` or a password manager; each JWT/refresh secret must be at least 32 characters. Never commit `.env`.

Environment variables: `NODE_ENV`, `PORT`, `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `REFRESH_TOKEN_SECRET`, `REFRESH_TOKEN_EXPIRES_IN`, `CORS_ORIGIN` (comma-separated exact origins), and `BCRYPT_ROUNDS` (10–15).

## Run

```sh
npm run dev
npm run build
npm start
npm test
```

The app fails fast on invalid/missing required environment variables. It does not run schema migrations automatically; apply the SQL schema before starting it. Configure TLS at the reverse proxy in production and set `NODE_ENV=production`; refresh cookies then require HTTPS.

## Authentication and security

Passwords are bcrypt-hashed (configurable cost, default 12). Access JWTs are signed with a dedicated secret and default to 15 minutes. Login/registration set a random 384-bit refresh token in an HttpOnly, SameSite=Strict cookie; the raw token is not persisted. The database stores an HMAC-SHA256 digest using a separate secret. Refresh rotates the token in a transaction, and logout revokes it. Clients using cross-origin cookies must use credentials and configure an exact matching `CORS_ORIGIN`.

Use HTTPS only in production. Access tokens are returned in JSON and should be held by clients in memory. Refresh token can also be supplied as a JSON `refreshToken` to `/refresh` or `/logout` for clients that cannot use cookies; cookie is preferred. These endpoints intentionally do not require an access token. Account deletion deactivates the user and revokes all sessions; identity and profile records remain to preserve referential integrity.

## API

All successful responses use `{ "success": true, "data": ..., "message": "..." }`; errors use `{ "success": false, "message": "...", "code": "..." }`.

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/health` | Public | Server and DB connectivity |
| POST | `/api/auth/register` | Public, rate limited | Create account; returns user and access token; sets refresh cookie |
| POST | `/api/auth/login` | Public, rate limited | Authenticate by username/password |
| POST | `/api/auth/refresh` | Refresh cookie/body | Rotate refresh token and issue access token |
| POST | `/api/auth/logout` | Refresh cookie/body | Revoke current refresh token and clear cookie |
| GET | `/api/users/me` | Bearer access token | Current user's safe profile |
| PUT | `/api/users/me` | Bearer access token | Update name, country, city, gender |
| DELETE | `/api/users/me` | Bearer access token | Deactivate account and revoke sessions |
| GET | `/api/users` | Bearer access token | Filter/paginate directory using `search`, `country`, `city`, `gender`, `page`, `limit` (max 100) |

Username comparison is case-insensitive under the database collation. SQL statements are parameterized. The user-list API never returns hashes or tokens. Authentication routes have a stricter rate limit; JSON bodies are capped at 32 KB.

## Tests

`npm test` runs request validation, HTTP boundary, unauthorized access and health-check tests; the MySQL-backed flow suite is skipped by default. To run persisted registration, duplicate account, invalid input, login, wrong password, profile, directory filters, logout and deactivation tests, create a disposable database whose name ends in `_test` (for example `connectchat_test`), import the schema, configure test-only DB credentials, and set `RUN_MYSQL_INTEGRATION=true` before running `npm test`. The runner refuses integration tests for a DB name that does not end in `test`. Never point tests at production data.

## Admin setup

There is no seeded admin or default password. Promote a verified account only through an operationally controlled database procedure, for example after account creation, by an authorized DBA: `UPDATE users SET role='ADMIN' WHERE id='<verified UUID>';`. Do not expose this operation through the public API.

## Hostinger deployment

This API requires a Node.js-capable Hostinger environment or a VPS (or another Node.js host). Do not assume a shared hosting plan supports persistent Node.js processes. MySQL may be hosted at Hostinger if network access is enabled; restrict the DB user and allowed hosts. Configure environment variables in the hosting control panel, run the build during deployment, use a process manager/reverse proxy with HTTPS, and verify `/api/health` after deployment.
