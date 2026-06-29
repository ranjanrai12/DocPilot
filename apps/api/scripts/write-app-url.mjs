// Appends APP_DATABASE_URL (the docpilot_app runtime connection) to apps/api/.env,
// derived from the owner DATABASE_URL host. Never prints the secret.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, '..', '.env');

const pw = process.env.APP_DB_PASSWORD;
const ownerUrl = process.env.DATABASE_URL;
if (!pw || !ownerUrl) {
  console.error('Need APP_DB_PASSWORD and DATABASE_URL.');
  process.exit(1);
}

// Host portion is everything after the final '@' (owner password may itself contain '@').
const hostPart = ownerUrl.slice(ownerUrl.lastIndexOf('@') + 1);
const appUrl = `postgresql://docpilot_app:${pw}@${hostPart}`;

let env = readFileSync(envPath, 'utf8');
if (/^APP_DATABASE_URL=/m.test(env)) {
  env = env.replace(/^APP_DATABASE_URL=.*$/m, `APP_DATABASE_URL=${appUrl}`);
} else {
  // Insert right after the DATABASE_URL line.
  env = env.replace(/^(DATABASE_URL=.*)$/m, `$1\nAPP_DATABASE_URL=${appUrl}`);
}
writeFileSync(envPath, env);
console.log('APP_DATABASE_URL written to apps/api/.env (value hidden).');
