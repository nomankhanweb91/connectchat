const { spawnSync } = require('node:child_process');
const env = { ...process.env, NODE_ENV:'test', DATABASE_HOST:process.env.DATABASE_HOST||'127.0.0.1', DATABASE_PORT:process.env.DATABASE_PORT||'3306', DATABASE_NAME:process.env.DATABASE_NAME||'connectchat_test', DATABASE_USER:process.env.DATABASE_USER||'connectchat_test', DATABASE_PASSWORD:process.env.DATABASE_PASSWORD||'', JWT_SECRET:process.env.JWT_SECRET||'test-only-access-secret-32-characters-minimum', REFRESH_TOKEN_SECRET:process.env.REFRESH_TOKEN_SECRET||'test-only-refresh-secret-32-characters-minimum', JWT_EXPIRES_IN:process.env.JWT_EXPIRES_IN||'15m', REFRESH_TOKEN_EXPIRES_IN:process.env.REFRESH_TOKEN_EXPIRES_IN||'30d' };
if (env.RUN_MYSQL_INTEGRATION === 'true' && !/(^|_)test$/i.test(env.DATABASE_NAME)) { console.error('Refusing integration tests: DATABASE_NAME must end in "test".'); process.exit(2); }
const result=spawnSync(process.execPath,['--test','test-dist/tests/api.test.js','test-dist/tests/validation.test.js','test-dist/tests/auth.integration.test.js','test-dist/tests/directory.integration.test.js','test-dist/tests/messaging.integration.test.js'],{stdio:'inherit',env});
process.exit(result.status??1);

