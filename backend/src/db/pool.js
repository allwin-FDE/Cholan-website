// The connection to Cholan's business database (PostgreSQL).
//
// Locally: DATABASE_URL, the test database on this computer (see .env.local).
// On Cloud Run: INSTANCE_CONNECTION_NAME + DB_IAM_USER, through Google's Cloud
// SQL connector with the service's own identity, so no password exists.
//
// The live server is the smallest Cloud SQL size (about 25 connections), so
// each server instance keeps only a few.
import pg from 'pg';

// bigint (int8) arrives from pg as text; money is in paise and stays far below
// 2^53, so it is read as a Number, refusing anything that would not fit.
pg.types.setTypeParser(20, (value) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error(`Number too large for JavaScript: ${value}`);
  return n;
});

// A date column (a price's "from" date, an invoice date) stays the plain text
// 'YYYY-MM-DD': turned into a JavaScript time it would be midnight UTC, which
// is 5:30 am in India and can show the wrong day.
pg.types.setTypeParser(1082, (value) => value);

let pool = null;
let connector = null;

export const dbEnabled = () => Boolean(process.env.DATABASE_URL || process.env.INSTANCE_CONNECTION_NAME);

async function makePool({ url, iamUser, max }) {
  const base = {
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // A stuck query or a forgotten transaction never holds a connection for long.
    statement_timeout: 10_000,
    idle_in_transaction_session_timeout: 30_000,
    application_name: 'cholan-backend',
  };
  if (url) return new pg.Pool({ ...base, connectionString: url });
  const { Connector, AuthTypes, IpAddressTypes } = await import('@google-cloud/cloud-sql-connector');
  connector ??= new Connector();
  const options = await connector.getOptions({
    instanceConnectionName: process.env.INSTANCE_CONNECTION_NAME,
    ipType: IpAddressTypes.PUBLIC,
    authType: AuthTypes.IAM,
  });
  return new pg.Pool({ ...base, ...options, user: iamUser, database: process.env.DB_NAME || 'cholan' });
}

export async function db() {
  if (!pool) {
    if (!dbEnabled()) throw Object.assign(new Error('The business database is not configured.'), { status: 503 });
    pool = await makePool({
      url: process.env.DATABASE_URL,
      iamUser: process.env.DB_IAM_USER,
      max: Number(process.env.DB_POOL_MAX) || 3,
    });
    pool.on('error', (error) => console.error('[db] idle connection error:', error.message));
  }
  return pool;
}

export async function query(text, values) {
  return (await db()).query(text, values);
}

// Runs fn(client) in one transaction, recording who acted (for the audit log).
// A deadlock or serialisation failure is retried, up to three tries in all.
export async function withTx(actor, fn) {
  const client = await (await db()).connect();
  try {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.actor', $1, true)", [String(actor || 'system')]);
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (attempt < 3 && (error.code === '40P01' || error.code === '40001')) continue;
        throw error;
      }
    }
  } finally {
    client.release();
  }
}

export async function closeDb() {
  await pool?.end();
  pool = null;
  connector?.close();
  connector = null;
}

// For scripts and tests: a pool for one connection string (migrator, admin).
export const poolFor = (url, max = 2) => makePool({ url, max });
