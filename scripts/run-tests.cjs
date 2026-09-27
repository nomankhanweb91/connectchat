const { spawnSync } = require('node:child_process');
const databaseHost=process.env.DB_HOST||process.env.DATABASE_HOST||'127.0.0.1';
const databasePort=process.env.DB_PORT||process.env.DATABASE_PORT||'3306';
const databaseName=process.env.DB_NAME||process.env.DATABASE_NAME||'connectchat_test';
const databaseUser=process.env.DB_USER||process.env.DATABASE_USER||'connectchat_test';
const databasePassword=process.env.DB_PASSWORD??process.env.DATABASE_PASSWORD??'';
const env = { ...process.env, NODE_ENV:'test', DB_HOST:databaseHost, DB_PORT:databasePort, DB_NAME:databaseName, DB_USER:databaseUser, DB_PASSWORD:databasePassword, DATABASE_HOST:databaseHost, DATABASE_PORT:databasePort, DATABASE_NAME:databaseName, DATABASE_USER:databaseUser, DATABASE_PASSWORD:databasePassword, JWT_SECRET:process.env.JWT_SECRET||'test-only-access-secret-32-characters-minimum', REFRESH_TOKEN_SECRET:process.env.REFRESH_TOKEN_SECRET||'test-only-refresh-secret-32-characters-minimum', JWT_EXPIRES_IN:process.env.JWT_EXPIRES_IN||'15m', REFRESH_TOKEN_EXPIRES_IN:process.env.REFRESH_TOKEN_EXPIRES_IN||'30d' };
if (env.RUN_MYSQL_INTEGRATION === 'true' && !/_test$/i.test(env.DATABASE_NAME)) { console.error('Refusing integration tests: DATABASE_NAME must end in "_test".'); process.exit(2); }
const result=spawnSync(process.execPath,['--test','test-dist/tests/api.test.js','test-dist/tests/validation.test.js','test-dist/tests/error-handler.test.js','test-dist/tests/auth.integration.test.js','test-dist/tests/directory.integration.test.js','test-dist/tests/messaging.integration.test.js','test-dist/tests/moderation.integration.test.js'],{stdio:'inherit',env});
process.exit(result.status??1);

