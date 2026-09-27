# ConnectChat backend (Phases 1–5)

Backend foundation for registration, authentication, profile management, authenticated user discovery, real-time one-to-one text and image messaging, user blocking, and abuse reporting. Client apps and an admin UI remain out of scope.

## Requirements

- Node.js 20 or newer and npm
- MySQL 8.0+ (the schema uses MySQL 8 collations and enforced check constraints)
- A MySQL account limited to the ConnectChat database

## Install and configure

```sh
npm install
mysql -u root -p -e "CREATE DATABASE connectchat CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
mysql -u root -p -e "CREATE USER 'connectchat_app'@'127.0.0.1' IDENTIFIED BY 'replace-with-a-long-random-password'; GRANT ALL PRIVILEGES ON connectchat.* TO 'connectchat_app'@'127.0.0.1';"
mysql --host=127.0.0.1 --user=connectchat_app --password connectchat < backend/database/schema.sql
cp .env.example .env
```

Create the database with an administrative account, then apply the schema using an application account scoped to that database. The schema file contains table definitions only; the database selected on the `mysql` command line is the only database it can affect.

Set production values through the hosting control panel; do not commit `.env`. Generate independent `JWT_SECRET` and `REFRESH_TOKEN_SECRET` values with `openssl rand -base64 48` or a password manager; each must be at least 32 characters. The app accepts Hostinger-facing `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` names. Existing `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, and `DATABASE_PASSWORD` aliases remain supported; if both forms are set, `DB_*` takes precedence.

Environment variables: `DB_HOST` (defaults to `127.0.0.1`), `DB_PORT` (defaults to `3306`), `DB_NAME` (required), `DB_USER` (required), `DB_PASSWORD` (required), `JWT_SECRET` (required, minimum 32 characters), `JWT_EXPIRES_IN` (default `15m`), `REFRESH_TOKEN_SECRET` (required, minimum 32 characters and distinct from JWT secret), `REFRESH_TOKEN_EXPIRES_IN` (default `30d`), `NODE_ENV` (set `production` in deployment), `PORT` (defaults to `3000`; set to the port assigned/configured by the host), and `CORS_ORIGIN` (defaults to local development; set exact production browser origins, comma-separated). Additional optional controls are `BCRYPT_ROUNDS` (10–15, default 12), `ONLINE_THRESHOLD_MINUTES` (1–1440, default 5), `MAX_IMAGE_SIZE_MB` (1–50, default 10), `IMAGE_UPLOADS_PER_15_MINUTES` (1–100 per account per process, default 10), `UPLOAD_STORAGE_DIR` (defaults to `var/uploads`), `BLOCK_ACTIONS_PER_HOUR` (default 60), `REPORTS_PER_HOUR` (default 20), and `MESSAGE_SENDS_PER_MINUTE` (default 30). Abuse limits are per account and process; configure a shared rate-limit store before running multiple API instances.

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
| POST | `/api/conversations` | Bearer access token | Create or return the 1-to-1 conversation for `{ "userId": "..." }` |
| GET | `/api/conversations` | Bearer access token | List the caller's conversations, last message, and unread counts |
| GET | `/api/conversations/:conversationId` | Bearer access token | Conversation details for a member |
| GET | `/api/conversations/:conversationId/messages?page=1&limit=30` | Bearer access token | Bounded, chronological page of message history (newest page first) |
| POST | `/api/conversations/:conversationId/messages` | Bearer access token | Persist and publish a text message |
| POST | `/api/conversations/:conversationId/messages/image` | Bearer access token, multipart `image` | Validate, persist, and publish an image message atomically |
| POST | `/api/uploads/images` | Bearer access token, multipart `image` | Store an image for a later image-message send |
| GET | `/api/uploads/images/:id` | Bearer access token | Stream image bytes only to its uploader before sending or conversation members after sending |
| POST | `/api/conversations/:conversationId/messages/:messageId/read` | Bearer access token | Mark a received message as read |
| POST | `/api/users/:userId/block` | Bearer access token | Block a user; repeating the request is idempotent |
| DELETE | `/api/users/:userId/block` | Bearer access token | Remove the caller's block; removing a missing block is safe |
| GET | `/api/users/blocked?page=1&limit=30` | Bearer access token | List only the caller's blocked users |
| POST | `/api/reports/user` | Bearer access token | Report an active user |
| POST | `/api/reports/message` | Bearer access token | Report a message the caller can currently access |
| GET | `/api/reports/mine?page=1&limit=30` | Bearer access token | List only reports created by the caller |

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

## One-to-one messaging

### Architecture and database

Express and Socket.IO share one Node HTTP server. MySQL remains the source of truth; socket events are emitted only after a successful message transaction commits. Phase 3 adds:

- `conversations`, with a canonical ordered participant pair and unique constraint so A+B and B+A resolve to one conversation.
- `conversation_members`, the authorization and room membership relation (the service creates exactly two members).
- `messages`, supporting `TEXT` content up to 4,000 characters and `IMAGE` rows that reference an upload.
- `message_receipts`, one recipient receipt per message, with nullable `delivered_at` and `read_at` timestamps.
- Phase 4 `uploads`, containing metadata and generated storage keys; image bytes remain in the configured storage provider, never in MySQL.

Apply migrations in order to an existing Phase 2 database:

```sh
mysql -u root -p connectchat < backend/database/migrations/phase2_user_directory_online_index.sql
mysql -u root -p connectchat < backend/database/migrations/phase3_messaging.sql
mysql -u root -p connectchat < backend/database/migrations/phase4_image_messaging.sql
mysql -u root -p connectchat < backend/database/migrations/phase5_moderation.sql
```

The Phase 2 index migration is needed only if it was not applied already. Fresh databases can import `backend/database/schema.sql` (which includes the Phase 2 index) and then apply Phase 3, Phase 4, and Phase 5 migrations. For an existing Phase 1 database, apply Phase 2 first, then Phase 3, Phase 4, and Phase 5. Migrations are explicit SQL; startup does not mutate the schema.

### REST and pagination

All conversation and message endpoints require a valid access token. Services check membership on every conversation read, history request, send, and read update. Unauthorized conversation reads return `404` to avoid revealing whether another user's conversation exists. Pages are 1-based (maximum 10,000); message limits are 1–100, default 30. History returns the newest page first, with each page ordered oldest-to-newest.

Start or retrieve the same conversation from either user:

```http
POST /api/conversations
Authorization: Bearer <access-token>
Content-Type: application/json

{ "userId": "<other-active-user-uuid>" }
```

Send a text message over REST:

```http
POST /api/conversations/<conversation-uuid>/messages
Authorization: Bearer <access-token>
Content-Type: application/json

{ "content": "Hi there" }
```

REST and socket sends return a message with `status: "SENT"`. The message-history DTO contains `id`, `conversationId`, `senderId`, `messageType`, `content`, `createdAt`, `updatedAt`, `status`, `deliveredAt`, and `readAt`. Conversation summaries include `otherUser`, `lastMessage`, `lastMessageAt`, and the caller's `unreadCount`.

### Socket.IO authentication and events

Connect to the same API origin using the existing access JWT; the server verifies it with the Phase 1 JWT secret and checks that the account is active:

```ts
const socket = io(API_ORIGIN, { auth: { token: accessToken } });
```

Do not put refresh tokens in the socket handshake. After `POST /api/conversations`, each client should join the conversation (existing conversation rooms are also joined on reconnect after membership is loaded from MySQL). The server checks membership before every join and event. Room names are generated server-side; clients cannot supply room names.

| Direction | Event | Payload / behavior |
|---|---|---|
| Client → server | `conversation:join` | `{ conversationId }`; joins only after membership check |
| Client → server | `conversation:leave` | `{ conversationId }`; leaves an authorized room |
| Client → server | `message:send` | `{ conversationId, content, messageType?: "TEXT" }`; persists then broadcasts `message:new` |
| Server → members | `message:new` | Persisted message DTO; emitted only after commit |
| Client → server | `message:delivered` | Recipient sends `{ messageId }` after handling `message:new` |
| Server → members | `message:delivered` | Emitted after receipt is recorded in MySQL |
| Client → server | `message:read` | Recipient sends `{ conversationId, messageId }` when the message is read |
| Server → members | `message:read` | Emitted after the recipient's read timestamp is persisted |
| Client → server | `typing:start`, `typing:stop` | `{ conversationId }`; authorized members only; never stored |
| Server → conversation | `presence:update` | `{ userId, isOnline, lastSeen }` on a user's first socket connect/final disconnect; a joining socket also receives a snapshot for active conversation peers |

Client-to-server events use an acknowledgement with `{ success: true, data }` or `{ success: false, error: { code, message } }`. Message sends are limited to 30 per user per minute per process. A sender's message remains `SENT` until the recipient acknowledges `message:delivered`; a recipient's explicit `message:read` changes it to `READ`. A read receipt also implies delivered. Socket.IO's default transport recovery is paired with durable MySQL history; reconnecting clients should rejoin rooms and request missed messages through the history API.

Presence tracks all active sockets per user in this process, so disconnecting one phone/browser does not mark a user offline while another socket remains connected. A new room join receives current presence for active conversation peers. Socket connections refresh `last_seen` at connect and final disconnect; authenticated HTTP requests also refresh it. The Phase 2 `ONLINE_THRESHOLD_MINUTES` rule remains available for directory status. For multiple Node instances, use sticky Socket.IO routing plus a shared Socket.IO adapter and distributed presence store; the current in-memory connection map is process-local.

### Local development client flow

1. Register/login and keep the returned access token in memory.
2. Connect Socket.IO with `{ auth: { token } }`.
3. Call `POST /api/conversations` with the other user's UUID.
4. Emit `conversation:join`; handle the acknowledgement before enabling sends.
5. Load history with `GET /api/conversations/:id/messages`.
6. Send via REST or `message:send`; render only the persisted `message:new` DTO.
7. When a recipient handles a new live or history-loaded message, emit `message:delivered`; when it is opened, emit `message:read`.
8. On reconnect, rejoin authorized rooms, fetch history from the last seen page/message, and acknowledge delivery for newly received messages.

`typing:start` / `typing:stop` are ephemeral room events and are not persisted. Group chat, arbitrary files, and client-app features remain out of scope.

### Image messaging (Phase 4)

Only JPEG/JPG, PNG, and WebP are accepted. The default upload limit is 10 MiB (configurable with `MAX_IMAGE_SIZE_MB`). Multer writes to the operating system temporary directory with a strict streaming size/count limit; Sharp decodes the image to verify actual format and dimensions (maximum 40 million pixels and 12,000 pixels per side). The MIME type and filename extension must agree with decoded content. SVG and all other document/executable types are rejected. Uploads are limited per authenticated account by `IMAGE_UPLOADS_PER_15_MINUTES` (default 10 per 15 minutes per process).

Send a message directly with one multipart request; the server checks conversation membership before accepting the image, validates and stores it, commits image metadata/message/receipt, and only then emits the existing `message:new` event. If persistence fails after storing, it removes the unattached metadata and attempts to delete the stored object:

```http
POST /api/conversations/<conversation-uuid>/messages/image
Authorization: Bearer <access-token>
Content-Type: multipart/form-data; boundary=...

image=<binary image file>
```

Alternatively, `POST /api/uploads/images` accepts the same multipart `image` field and stores an unattached image. The uploader may later submit its returned `id` as `{ "imageId": "..." }` (JSON) to the image-message endpoint. Unattached uploads can be viewed only by their uploader and can be cleaned up through the future media lifecycle work.

`GET /api/uploads/images/:id` streams bytes after checking the caller is the uploader (unattached) or a conversation member (attached). It does not expose a filesystem path and never serves a public/static directory. Message DTOs use `messageType: "IMAGE"`, empty `content`, and a safe `image` object (`id`, authorized API `url`, MIME type, dimensions, and size). The recipient receives the same shape through `message:new`, and conversation history and last-message summaries include it. Clients should use the access token when requesting the image URL.

Storage is behind `StorageProvider` / `StorageService`; the development provider is local filesystem storage rooted at `UPLOAD_STORAGE_DIR` (default `var/uploads`, ignored by Git). Keys are server-generated UUIDs with validated extensions. Configure `UPLOAD_STORAGE_DIR` to an appropriate private persistent volume in production. A Hostinger/VPS or object-storage provider can implement the same interface without changing message services; the repository does not assume a provider-specific path. Keep that directory outside the web root, restrict filesystem permissions, back it up as needed, and use HTTPS in deployment.

### Blocking and reports (Phase 5)

`blocks` stores a directional edge: only the blocker can remove that edge. The application treats either edge between two users as a mutual interaction denial. If A blocks B, both A and B are prevented from initiating conversations, sending REST or socket messages, joining the old conversation, reading its history, or viewing attached images. Existing conversation/message records are retained, but conversation lists omit the pair and conversation/image APIs return not found while either directional block exists. Active local Socket.IO room membership is evicted when the block is added; subsequent joins and events are checked against MySQL. Unblocking removes only the caller's edge; access returns only when no reverse edge remains. Repeated block and unblock actions are safe and report whether state changed.

The block list and directory are viewer-specific and require authentication. `GET /api/users/:id` retains its pre-Phase-5 public-profile behavior for anonymous callers, who have no identity for a viewer-specific block check; when a bearer token is supplied, either-direction blocks return the same `404` used for a missing user. The endpoint still returns only the public profile DTO.

`reports` supports USER and MESSAGE targets. Submit JSON such as `{ "userId": "<uuid>", "reason": "SPAM", "description": "Repeated unsolicited messages" }` to `POST /api/reports/user`, or `{ "messageId": "<uuid>", "reason": "HARASSMENT" }` to `POST /api/reports/message`. Reasons are `SPAM`, `HARASSMENT`, `SCAM`, `ABUSIVE_CONTENT`, `INAPPROPRIATE_CONTENT`, `IMPERSONATION`, and `OTHER`. Descriptions are optional, trimmed, and limited to 2,000 characters. Self-reports are rejected. Message reports require current access to the conversation and cannot target your own message; inaccessible IDs return a generic `404`. One user report per reporter/target and one message report per reporter/message are allowed; duplicates return `409 DUPLICATE_REPORT`. Reports start as `OPEN`; the status enum also reserves `REVIEWED`, `RESOLVED`, and `DISMISSED` for future moderation tooling. There are no admin report APIs in this phase.

`GET /api/reports/mine` returns only the authenticated caller's reports and never includes message content. Report creation, block/unblock actions, and REST message sends are limited per authenticated account by `REPORTS_PER_HOUR` (20/hour), `BLOCK_ACTIONS_PER_HOUR` (60/hour), and `MESSAGE_SENDS_PER_MINUTE` (30/minute). Socket message sends share the 30/minute setting; image upload endpoints also retain the Phase 4 upload quota. These limiters use in-memory stores and are per process; use a shared store when deploying multiple API instances.

Username comparison is case-insensitive under the database collation. SQL statements are parameterized. Authentication routes have a stricter rate limit; JSON bodies are capped at 32 KB.

## Tests

`npm test` runs request validation and HTTP boundary tests; MySQL-backed auth, directory, messaging, image, Socket.IO, and moderation suites are skipped by default. They cover registration/profile, directory privacy, message/image access, block enforcement across REST and Socket.IO, report validation/ownership/duplicates, and rate limiting. Integration tests are enabled only by `RUN_MYSQL_INTEGRATION=true`. The test runner refuses to start them unless `DATABASE_NAME` ends exactly in `_test` (case-insensitive). Use a dedicated disposable database and account; never point tests at production data.

### Safe MySQL integration-test setup

The integration suites require these connection variables: `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, and `DATABASE_PASSWORD`. Also set `UPLOAD_STORAGE_DIR` to a disposable temporary directory because the image suite writes files there. `RUN_MYSQL_INTEGRATION=true` enables the suites; the test runner forces `NODE_ENV=test` and supplies test-only JWT secrets if they are not set. The default DB target is `connectchat_test`, but provide an explicit test-only account and password.

For a fresh disposable database on a local MySQL 8 server, provision it and a least-privilege test account (replace the example password locally; do not commit it):

```sql
CREATE DATABASE connectchat_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'connectchat_test'@'127.0.0.1' IDENTIFIED BY 'replace-with-a-local-test-only-password';
GRANT ALL PRIVILEGES ON connectchat_test.* TO 'connectchat_test'@'127.0.0.1';
```

Run that SQL once through an administrative MySQL session. Then, from Command Prompt in the repository root, initialize only the explicitly selected `connectchat_test` database. The Phase 1 schema includes the Phase 2 online-directory index, so the separate Phase 2 index migration is not run on a fresh schema. Apply the remaining migrations in order:

```bat
mysql --host=127.0.0.1 --port=3306 --user=connectchat_test --password connectchat_test < backend\database\schema.sql
mysql --host=127.0.0.1 --port=3306 --user=connectchat_test --password connectchat_test < backend\database\migrations\phase3_messaging.sql
mysql --host=127.0.0.1 --port=3306 --user=connectchat_test --password connectchat_test < backend\database\migrations\phase4_image_messaging.sql
mysql --host=127.0.0.1 --port=3306 --user=connectchat_test --password connectchat_test < backend\database\migrations\phase5_moderation.sql
```

The `--password` option prompts interactively. These commands explicitly select `connectchat_test`; do not replace that target with another database. For an existing Phase 1 test database that does not already have the directory index, apply `phase2_user_directory_online_index.sql` before Phase 3. Do not apply it after importing the current schema, because that schema already creates the index.

Set the test environment in PowerShell (the password is only an example; enter the local test account’s password):

```powershell
$env:RUN_MYSQL_INTEGRATION = 'true'
$env:DATABASE_HOST = '127.0.0.1'
$env:DATABASE_PORT = '3306'
$env:DATABASE_NAME = 'connectchat_test'
$env:DATABASE_USER = 'connectchat_test'
$env:DATABASE_PASSWORD = 'replace-with-a-local-test-only-password'
$env:UPLOAD_STORAGE_DIR = Join-Path $env:TEMP 'connectchat-test-uploads'
npm test
```

The integration fixtures create uniquely named temporary accounts and remove their rows during cleanup. Drop `connectchat_test` only after confirming it contains no data you need; it should never contain production data.

## Admin setup

There is no seeded admin or default password. Promote a verified account only through an operationally controlled database procedure, for example after account creation, by an authorized DBA: `UPDATE users SET role='ADMIN' WHERE id='<verified UUID>';`. Do not expose this operation through the public API.

## Hostinger deployment

The production build command is `npm run build`; the start command is `npm start`, which runs `node dist/server.js`. The TypeScript source entry point is `src/server.ts`; the compiled production entry point is `dist/server.js`. The HTTP API and Socket.IO share that server and `PORT`; there is no separate Socket.IO port or Socket.IO-specific environment variable. Socket authentication uses `JWT_SECRET` and the same active-account checks as the HTTP API. Use a Hostinger Node.js-capable plan or VPS that supports persistent Node.js processes and Node.js 20 or newer; configure the panel's build/start settings to the commands above.

Configure `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` in Hostinger's application environment settings. For databases used by a website on the same Hostinger account, Hostinger documents `localhost` as the database host and uses port `3306`; use the actual host shown in the panel if the app connects remotely. Remote connections require enabling Remote MySQL for the application server's source IP and using the hostname shown in that panel. Do not put the database password in this repository. Hostinger lets you set these values in its Node.js deployment environment settings: [environment variables for Node.js deployments](https://www.hostinger.com/support/how-to-add-environment-variables-during-node-js-application-deployment/), [finding MySQL connection details](https://www.hostinger.com/support/1583552-how-to-find-your-mysql-database-details-in-hostinger/), and [remote MySQL access](https://www.hostinger.com/support/1583546-how-to-set-up-remote-mysql-access-in-hostinger/).

`UPLOAD_STORAGE_DIR` must point to a writable, private directory outside the public web root that persists across application restarts and deployments. This app currently stores image files on the local filesystem; that is suitable only if the selected Hostinger environment guarantees those persistence and filesystem-permission properties. Confirm the path with the host before deployment. If it does not provide persistent private storage, a persistent volume or an object-storage provider implementing the existing `StorageProvider` contract will be needed; this deployment task does not change the storage implementation. Keep `NODE_ENV=production` so refresh cookies require HTTPS, configure exact `CORS_ORIGIN` values for browser clients, and verify `/api/health` after deployment.

### Applying Phase 5 to an existing database

For a database that already has Phases 1–4, select that existing database in phpMyAdmin and import only `backend/database/migrations/phase5_moderation.sql`. It creates the `blocks` and `reports` tables with their indexes and constraints and does not drop tables or modify existing user/message rows. Do not re-import `backend/database/connectchat_hostinger.sql` into an existing database: it is intended for an empty database, and its Phase 4 `ALTER TABLE messages` is a one-time migration. After applying Phase 5, import `backend/database/verify_phase5_schema.sql` in the same selected database to check the required tables, Phase 5 indexes, and constraints. The verification file only reads `information_schema` and makes no changes.

