# ConnectChat backend (Phase 1 and 2)

Backend foundation for registration, authentication, profile management and authenticated user discovery. Messaging, sockets, media upload, client apps and an admin UI are outside these phases.

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

Environment variables: `NODE_ENV`, `PORT`, `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `REFRESH_TOKEN_SECRET`, `REFRESH_TOKEN_EXPIRES_IN`, `CORS_ORIGIN` (comma-separated exact origins), `BCRYPT_ROUNDS` (10–15), and `ONLINE_THRESHOLD_MINUTES` (1–1440, default 5).

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
| GET | `/api/users` | Bearer access token | Excludes the caller; filter and paginate the public directory |
| GET | `/api/users/:id` | Public | Fetch a safe public profile by user UUID |

### User directory

`GET /api/users` accepts these query parameters (all filters combine with AND):

| Parameter | Behavior |
|---|---|
| `search` | Prefix search in username or display name, 1–100 characters |
| `country`, `city` | Case-insensitive exact matches under the MySQL collation |
| `gender` | Exact match |
| `online` | `true` or `false` based on recent `last_seen` activity |
| `page` | 1-based page number, 1–10,000; default 1 |
| `limit` | 1–100 results; default 20 |

Example:

```http
GET /api/users?search=noman&country=India&city=Delhi&gender=Male&online=true&page=1&limit=20
Authorization: Bearer <access-token>
```

Each directory entry and public profile contains only `id`, `username`, `name`, `country`, `city`, `gender`, `profileImageUrl`, `isVerified`, `isOnline`, and `lastSeen`. Password hashes, roles, sessions, and tokens are excluded. Directory results never include the authenticated caller. Results sort online first, then by recent activity, username, and ID for stable pagination ordering. Search is a literal prefix match so the existing username and name indexes can help avoid a full substring scan.

Online means the user has an authenticated API request recorded in `last_seen` within `ONLINE_THRESHOLD_MINUTES` (default 5). The authentication middleware updates `last_seen` on authenticated requests. This is an activity-based approximation; without a realtime connection, it is not a live socket-presence signal. SQL uses the database clock for the cutoff. Existing Phase 1 schema already has `last_seen`, username/name indexes, and a composite country/city/gender directory index. Apply `backend/database/migrations/phase2_user_directory_online_index.sql` once to an existing Phase 1 database to add `(is_active, last_seen)` for online filtering; fresh schema imports already include it. This repository does not use an automatic migration runner.

Example success response:

```json
{
  "success": true,
  "data": {
    "users": [{
      "id": "0e5e6af2-70cb-48d6-8a1d-499048c9f8a2",
      "username": "noman_1",
      "name": "Noman Khan",
      "country": "India",
      "city": "Delhi",
      "gender": "Male",
      "profileImageUrl": null,
      "isVerified": false,
      "isOnline": true,
      "lastSeen": "2026-09-27T12:00:00.000Z"
    }],
    "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
  },
  "message": "Users fetched successfully"
}
```

Public profile example: `GET /api/users/0e5e6af2-70cb-48d6-8a1d-499048c9f8a2`. This route does not require authentication and returns the same public profile fields, or a structured `404` if the account is missing or inactive.

Username comparison is case-insensitive under the database collation. SQL statements are parameterized. Authentication routes have a stricter rate limit; JSON bodies are capped at 32 KB.

## Tests

`npm test` runs request validation and HTTP boundary tests; MySQL-backed auth and directory suites are skipped by default. They cover registration/login, profile operations, directory auth, self-exclusion, username/name search, filters, online status, pagination, public profile, response privacy, and invalid parameters. To run them, create a disposable database whose name ends in `_test` (for example `connectchat_test`), import the schema, configure test-only DB credentials, and set `RUN_MYSQL_INTEGRATION=true` before `npm test`. The runner refuses integration tests for a database name that does not end in `test`. Never point tests at production data.

## Admin setup

There is no seeded admin or default password. Promote a verified account only through an operationally controlled database procedure, for example after account creation, by an authorized DBA: `UPDATE users SET role='ADMIN' WHERE id='<verified UUID>';`. Do not expose this operation through the public API.

## Hostinger deployment

This API requires a Node.js-capable Hostinger environment or a VPS (or another Node.js host). Do not assume a shared hosting plan supports persistent Node.js processes. MySQL may be hosted at Hostinger if network access is enabled; restrict the DB user and allowed hosts. Configure environment variables in the hosting control panel, run the build during deployment, use a process manager/reverse proxy with HTTPS, and verify `/api/health` after deployment.
