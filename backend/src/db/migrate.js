// Applies the database's structure: backend/migrations/NNNN_name.sql, in order,
// each once, each in its own transaction, recorded in core.schema_migrations
// with a checksum. A file already applied must never change; add a new one.
//
//   npm run db:migrate             (locally: MIGRATE_DATABASE_URL in .env.local)
//
// On Cloud Run it runs as a job before each release, as cholan-migrator
// (INSTANCE_CONNECTION_NAME + DB_IAM_USER). Everything it creates is owned by
// cholan_owner, so the website (cholan_app) gets only what is granted to it.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.resolve(here, '..', '..', 'migrations');
const LOCK_KEY = 74_201_826; // any fixed number: one release at a time

export function migrationFiles(dir = MIGRATIONS_DIR) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
    .sort()
    .map((file) => {
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      return { version: file.slice(0, 4), file, sql, checksum: crypto.createHash('sha256').update(sql).digest('hex') };
    });
}

export async function migrate(pool, { dir = MIGRATIONS_DIR, log = console.log } = {}) {
  const client = await pool.connect();
  try {
    await client.query('SET ROLE cholan_owner');
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query('CREATE SCHEMA IF NOT EXISTS core');
    await client.query(`CREATE TABLE IF NOT EXISTS core.schema_migrations (
      version text PRIMARY KEY,
      file text NOT NULL,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(),
      applied_by text NOT NULL DEFAULT session_user
    )`);
    const done = new Map((await client.query('SELECT version, file, checksum FROM core.schema_migrations')).rows.map((r) => [r.version, r]));
    const applied = [];
    for (const m of migrationFiles(dir)) {
      const before = done.get(m.version);
      if (before) {
        if (before.checksum !== m.checksum) throw new Error(`${m.file} was changed after it was applied. Put the change in a new migration instead.`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query('INSERT INTO core.schema_migrations (version, file, checksum) VALUES ($1, $2, $3)', [m.version, m.file, m.checksum]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw Object.assign(error, { message: `${m.file}: ${error.message}` });
      }
      applied.push(m.file);
      log(`applied ${m.file}`);
    }
    if (!applied.length) log('database is up to date');
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    client.release();
  }
}

// Run directly: npm run db:migrate
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { poolFor, db, closeDb } = await import('./pool.js');
  const local = Boolean(process.env.MIGRATE_DATABASE_URL);
  if (!local) process.env.DB_POOL_MAX = '1'; // Cloud Run job: the migrator's own identity
  const pool = local ? await poolFor(process.env.MIGRATE_DATABASE_URL, 1) : await db();
  try {
    await migrate(pool);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    if (local) await pool.end();
    else await closeDb();
  }
}
