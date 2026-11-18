// npm run test:db — the business database's structure and rules, on a fresh
// throwaway database on the local test server (D:\cholan-dev-db). Skipped when
// DEV_DB_ADMIN_URL is not set (for example on a machine without it).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { migrate, MIGRATIONS_DIR } from '../src/db/migrate.js';
import { seed, loadSiteData } from '../scripts/seed-reference.js';
import '../src/db/pool.js'; // bigint as Number

const ADMIN = process.env.DEV_DB_ADMIN_URL;
const name = `cholan_test_${process.pid}`;
const urlFor = (url, database) => Object.assign(new URL(url), { pathname: `/${database}` }).href;
const quiet = () => {};

describe('business database', { skip: !ADMIN && 'DEV_DB_ADMIN_URL is not set' }, () => {
  let admin;
  let owner; // the release account (cholan_migrator, acting as cholan_owner)
  let app; // the website (cholan_api, in cholan_app)

  before(async () => {
    admin = new pg.Pool({ connectionString: ADMIN, max: 1 });
    await admin.query(`CREATE DATABASE ${name} OWNER cholan_owner`);
    await admin.query(`REVOKE ALL ON DATABASE ${name} FROM PUBLIC`);
    await admin.query(`GRANT CONNECT, TEMPORARY ON DATABASE ${name} TO cholan_owner, cholan_app, cholan_read`);
    owner = new pg.Pool({ connectionString: urlFor(process.env.MIGRATE_DATABASE_URL, name), max: 2 });
    app = new pg.Pool({ connectionString: urlFor(process.env.DATABASE_URL, name), max: 2 });
  });

  after(async () => {
    await owner?.end();
    await app?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin?.end();
  });

  const fails = async (promise, code, label) => {
    await assert.rejects(promise, (error) => error.code === code || assert.fail(`${label}: expected ${code}, got ${error.code} ${error.message}`), label);
  };
  // One website transaction, as a named member of staff.
  const asStaff = async (actor, fn) => {
    const client = await app.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.actor', $1, true)", [actor]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };
  const itemId = async (sku) => (await app.query('SELECT id FROM catalog.items WHERE sku_code = $1', [sku])).rows[0].id;
  const listId = async (code) => (await app.query('SELECT id FROM price.price_lists WHERE code = $1', [code])).rows[0].id;
  const newCustomer = async (segment, list) =>
    asStaff('test@cholanrice.in', async (c) => {
      const id = (await c.query("INSERT INTO party.parties (kind, display_name, is_customer) VALUES ('business', $1, true) RETURNING id", [`Test ${segment} ${Date.now()}`])).rows[0].id;
      await c.query('INSERT INTO party.customer_profiles (party_id, segment, price_list_id) VALUES ($1, $2, $3)', [id, segment, await listId(list)]);
      return id;
    });

  test('the structure builds from empty, and a second run changes nothing', async () => {
    const applied = await migrate(owner, { log: quiet });
    assert.deepEqual(applied, fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort());
    assert.deepEqual(await migrate(owner, { log: quiet }), []);
  });

  test('a migration edited after it was applied is refused', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cholan-migrations-'));
    for (const f of fs.readdirSync(MIGRATIONS_DIR)) fs.copyFileSync(path.join(MIGRATIONS_DIR, f), path.join(dir, f));
    fs.appendFileSync(path.join(dir, '0001_core.sql'), '\n-- edited\n');
    await assert.rejects(migrate(owner, { dir, log: quiet }), /was changed after it was applied/);
    fs.rmSync(dir, { recursive: true });
  });

  test('the website data loads, and loading again adds nothing', async () => {
    const data = await loadSiteData();
    const packs = data.products.flatMap((p) => p.packs);
    const counts = await seed(owner, { data, log: quiet });
    assert.equal(counts.products, data.products.length);
    assert.equal(counts.items, packs.length);
    assert.equal(counts.prices, packs.filter((p) => p.price != null).length);
    assert.equal(counts.branches, 1);
    const again = await seed(owner, { data, log: quiet });
    assert.ok(Object.values(again).every((n) => n === 0), JSON.stringify(again));
    const item = (await app.query("SELECT pack_label, net_weight_g, gst_rate_bp, gst_confirmed FROM catalog.items WHERE sku_code = 'CPR-26KG'")).rows[0];
    assert.deepEqual(item, { pack_label: '26 kg', net_weight_g: 26000, gst_rate_bp: 0, gst_confirmed: false });
    assert.equal((await app.query("SELECT gst_rate_bp FROM catalog.items WHERE sku_code = 'CPR-5KG'")).rows[0].gst_rate_bp, 500);
  });

  test('the website can read, add and change, but never delete', async () => {
    const id = (await app.query("INSERT INTO party.parties (kind, display_name, is_customer) VALUES ('person', 'Delete Test', true) RETURNING id")).rows[0].id;
    await app.query("UPDATE party.parties SET display_name = 'Delete Test 2' WHERE id = $1", [id]);
    await fails(app.query('DELETE FROM party.parties WHERE id = $1', [id]), '42501', 'delete');
    await fails(app.query('TRUNCATE party.contacts'), '42501', 'truncate');
    await fails(app.query("INSERT INTO core.audit_log (actor, table_name, action) VALUES ('x', 'y', 'insert')"), '42501', 'write the audit log');
    await fails(app.query('UPDATE core.audit_log SET actor = actor'), '42501', 'edit the audit log');
    await fails(app.query('CREATE TABLE party.sneaky (id int)'), '42501', 'create a table');
    await fails(app.query('ALTER TABLE party.parties ADD COLUMN x int'), '42501', 'change a table');
  });

  test('every change is logged with who made it', async () => {
    const id = await asStaff('ravi@cholanrice.in', async (c) =>
      (await c.query("INSERT INTO party.parties (kind, display_name, is_customer, phone) VALUES ('person', 'Lakshmi', true, '+919876543210') RETURNING id")).rows[0].id,
    );
    await asStaff('meena@cholanrice.in', (c) => c.query("UPDATE party.parties SET display_name = 'Lakshmi R' WHERE id = $1", [id]));
    const log = (await app.query("SELECT actor, action, old_row->>'display_name' AS was, new_row->>'display_name' AS now FROM core.audit_log WHERE table_name = 'party.parties' AND row_id = $1 ORDER BY id", [String(id)])).rows;
    assert.deepEqual(log, [
      { actor: 'ravi@cholanrice.in', action: 'insert', was: null, now: 'Lakshmi' },
      { actor: 'meena@cholanrice.in', action: 'update', was: 'Lakshmi', now: 'Lakshmi R' },
    ]);
    const row = (await app.query('SELECT updated_by FROM party.parties WHERE id = $1', [id])).rows[0];
    assert.equal(row.updated_by, 'meena@cholanrice.in');
  });

  test('GSTINs, phone numbers and addresses are checked', async () => {
    await fails(app.query("INSERT INTO party.parties (kind, display_name, is_customer, gstin) VALUES ('business', 'Bad GST', true, '33ABC')"), '23514', 'short GSTIN');
    await fails(app.query("INSERT INTO party.parties (kind, display_name, is_customer, phone) VALUES ('person', 'No Code', true, '9092266667')"), '23514', 'phone without +91');
    await fails(app.query("INSERT INTO party.parties (kind, display_name, is_customer, gstin, pan) VALUES ('business', 'PAN Clash', true, '33AAKCC0627N1ZL', 'ABCDE1234F')"), '23514', 'GSTIN and PAN disagree');
    const id = (await app.query("INSERT INTO party.parties (kind, display_name, is_supplier, gstin) VALUES ('business', 'Kerala Mill', true, '32AAKCC0627N1ZL') RETURNING id")).rows[0].id;
    await fails(app.query("INSERT INTO party.addresses (party_id, kind, line1, city, state_code, pincode, gstin) VALUES ($1, 'billing', '1 Road', 'Palakkad', '33', '678001', '32AAKCC0627N1ZL')", [id]), '23514', 'GSTIN from another state');
    await app.query("INSERT INTO party.addresses (party_id, kind, line1, city, state_code, pincode, gstin) VALUES ($1, 'billing', '1 Road', 'Palakkad', '32', '678001', '32AAKCC0627N1ZL')", [id]);
    await fails(app.query("INSERT INTO party.parties (kind, display_name, is_customer, phone) VALUES ('person', 'Twin', true, '+919876543210')"), '23505', 'two households with one mobile');
  });

  test('two prices for the same item and quantity may not cover the same day', async () => {
    const item = await itemId('KTM-26KG');
    const retail = await listId('RETAIL');
    const add = (from, to, minQty = 1, price = 230000) =>
      app.query('INSERT INTO price.list_items (price_list_id, item_id, min_qty, price_paise, valid_from, valid_to) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id', [retail, item, minQty, price, from, to]);
    const first = (await add('2026-11-01', null)).rows[0].id;
    await fails(add('2026-12-01', null), '23P01', 'open-ended overlap');
    await add('2026-11-01', null, 10, 225000); // a slab is a different price
    await app.query("UPDATE price.list_items SET valid_to = '2026-11-30' WHERE id = $1", [first]);
    await add('2026-12-01', null, 1, 235000); // the next month's price, after closing the old one
    await fails(add('2026-11-15', '2026-12-05'), '23P01', 'overlap with both');
  });

  test('the price is the special price, then the customer list, then the website price', async () => {
    const item = await itemId('KAR-26KG');
    const hotel = await newCustomer('hotel', 'HOTEL');
    const resolve = async (qty, on = '2026-11-20') => (await app.query('SELECT * FROM price.resolve($1, $2, $3, $4)', [hotel, item, qty, on])).rows[0];
    assert.deepEqual(await resolve(1), { price_paise: 245000, includes_gst: true, source: 'list:WEB' });
    await app.query("INSERT INTO price.list_items (price_list_id, item_id, price_paise, valid_from) VALUES ($1, $2, 240000, '2026-11-01')", [await listId('HOTEL'), item]);
    await app.query("INSERT INTO price.list_items (price_list_id, item_id, min_qty, price_paise, valid_from) VALUES ($1, $2, 10, 236000, '2026-11-01')", [await listId('HOTEL'), item]);
    assert.deepEqual(await resolve(9), { price_paise: 240000, includes_gst: true, source: 'list:HOTEL' });
    assert.deepEqual(await resolve(10), { price_paise: 236000, includes_gst: true, source: 'list:HOTEL' });
    await app.query("INSERT INTO price.customer_prices (party_id, item_id, price_paise, valid_from, valid_to) VALUES ($1, $2, 232000, '2026-11-15', '2026-11-30')", [hotel, item]);
    assert.deepEqual(await resolve(10), { price_paise: 232000, includes_gst: true, source: 'special' });
    assert.deepEqual(await resolve(10, '2026-12-01'), { price_paise: 236000, includes_gst: true, source: 'list:HOTEL' });
    const household = (await app.query("INSERT INTO party.parties (kind, display_name, is_customer) VALUES ('person', 'Walk-in', true) RETURNING id")).rows[0].id;
    const walkIn = (await app.query('SELECT * FROM price.resolve($1, $2, 1)', [household, item])).rows[0];
    assert.equal(walkIn.source, 'list:WEB');
  });
});
