// Loads Cholan's starting reference data into the business database, from the
// website's own files, so both say the same thing:
//
//   npm run db:seed        (locally: MIGRATE_DATABASE_URL in .env.local)
//
// - the company and its Tamil Nadu GST registration (frontend config/site.js)
// - the main branch at the registered address, with its storage places
// - categories, the 11 products and every pack size as a sellable item
// - the website prices (frontend data/products.js) on the WEB price list
//
// Safe to run again: it adds what is missing and never overwrites anything
// already in the database (so a price or rate changed in the system stays).
// GST rates are a first guess (5% up to 25 kg, 0% above) marked unconfirmed
// until the CA checks them.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(here, '..', '..', 'frontend', 'src');

// Short codes for SKU numbers, e.g. CPR-26KG. Fixed here so they never change.
export const PRODUCT_CODES = {
  'chennai-pattanam-rice': 'CPR',
  'karikalan-rice': 'KAR',
  'kettimelam-rice': 'KTM',
  'moongil-ponni': 'MGP',
  senthoora: 'SEN',
  'senthoora-half-boil': 'SHB',
  'thooyamalli-ponni-raw-rice': 'TPR',
  'chennai-pattanam-idli-rice': 'CPI',
  'kurunai-rice': 'KUR',
  'basmati-rice': 'BAS',
  'seeraga-samba': 'SSB',
};
export const PRICES_FROM = '2026-11-01'; // the November 2026 price list

const kgOf = (size) => {
  const m = /^(\d+(?:\.\d+)?)\s*kg$/i.exec(String(size).trim());
  return m ? Number(m[1]) : null;
};

export async function loadSiteData(frontendDir = FRONTEND) {
  const load = (rel) => import(pathToFileURL(path.join(frontendDir, rel)).href);
  const [{ site }, { products }, { categories }] = await Promise.all([load('config/site.js'), load('data/products.js'), load('data/categories.js')]);
  return { site, products, categories };
}

export async function seed(pool, { data, log = console.log } = {}) {
  const { site, products, categories } = data || (await loadSiteData());
  const unknown = products.filter((p) => !PRODUCT_CODES[p.id]).map((p) => p.id);
  if (unknown.length) throw new Error(`Add a short SKU code in PRODUCT_CODES for: ${unknown.join(', ')}`);

  const client = await pool.connect();
  const counts = { company: 0, branches: 0, locations: 0, categories: 0, products: 0, items: 0, prices: 0 };
  try {
    await client.query('SET ROLE cholan_owner');
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.actor', 'seed: website data', true)");
    const add = async (key, sql, values) => {
      const { rowCount } = await client.query(sql, values);
      counts[key] += rowCount;
    };

    const gstin = site.gstin;
    await add(
      'company',
      `INSERT INTO org.company (id, legal_name, brand_name, cin, pan, phone, email, website)
       VALUES (1, $1, $2, $3, $4, $5, $6, 'https://www.cholanrice.in') ON CONFLICT (id) DO NOTHING`,
      [site.legalName, site.name, site.cin, gstin.slice(2, 12), `+${site.phoneRaw}`, site.email.toLowerCase()],
    );
    const address = [site.address.line1, site.address.line2, site.address.pincode, site.address.state].join(', ');
    await client.query(
      `INSERT INTO org.gst_registrations (gstin, state_code, legal_name, address) VALUES ($1, $2, $3, $4)
       ON CONFLICT (gstin) DO NOTHING`,
      [gstin, gstin.slice(0, 2), site.legalName, address],
    );
    const reg = (await client.query('SELECT id FROM org.gst_registrations WHERE gstin = $1', [gstin])).rows[0].id;
    await add(
      'branches',
      `INSERT INTO org.branches (code, name, kind, gst_registration_id, address_line1, address_line2, city, pincode, state_code, phone, fssai_licence)
       VALUES ('CBE', 'Coimbatore, Sanganoor', 'store', $1, $2, $3, 'Coimbatore', $4, $5, $6, $7) ON CONFLICT (code) DO NOTHING`,
      [reg, site.address.line1, site.address.line2, site.address.pincode, gstin.slice(0, 2), `+${site.phoneRaw}`, site.fssai],
    );
    const branch = (await client.query("SELECT id FROM org.branches WHERE code = 'CBE'")).rows[0].id;
    for (const [code, name, kind] of [
      ['MAIN', 'Main godown', 'godown'],
      ['DMG', 'Damaged goods', 'damaged'],
      ['TRANSIT', 'In transit', 'in_transit'],
    ]) {
      await add('locations', 'INSERT INTO org.locations (branch_id, code, name, kind) VALUES ($1, $2, $3, $4) ON CONFLICT (branch_id, code) DO NOTHING', [branch, code, name, kind]);
    }

    for (const c of categories) {
      await add('categories', 'INSERT INTO catalog.categories (slug, name) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING', [c.slug, c.name]);
    }
    const categoryIds = Object.fromEntries((await client.query('SELECT slug, id FROM catalog.categories')).rows.map((r) => [r.slug, r.id]));
    const web = (await client.query("SELECT id FROM price.price_lists WHERE code = 'WEB'")).rows[0].id;

    for (const p of products) {
      await add(
        'products',
        `INSERT INTO catalog.products (slug, name, tamil_name, category_id, description) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (slug) DO NOTHING`,
        [p.id, p.name, p.tamil || null, categoryIds[p.category], p.description || null],
      );
      const productId = (await client.query('SELECT id FROM catalog.products WHERE slug = $1', [p.id])).rows[0].id;
      for (const pack of p.packs) {
        const kg = kgOf(pack.size);
        if (!kg) throw new Error(`${p.id}: cannot read the pack size "${pack.size}"`);
        const sku = `${PRODUCT_CODES[p.id]}-${String(kg).replace('.', 'P')}KG`;
        await add(
          'items',
          `INSERT INTO catalog.items (kind, product_id, sku_code, name, pack_label, net_weight_g, uom, hsn, gst_rate_bp)
           VALUES ('finished', $1, $2, $3, $4, $5, 'bag', '1006', $6) ON CONFLICT (sku_code) DO NOTHING`,
          [productId, sku, `${p.name} ${pack.size}`, pack.size, Math.round(kg * 1000), kg <= 25 ? 500 : 0],
        );
        if (pack.price == null) continue;
        const itemId = (await client.query('SELECT id FROM catalog.items WHERE sku_code = $1', [sku])).rows[0].id;
        await add(
          'prices',
          `INSERT INTO price.list_items (price_list_id, item_id, min_qty, price_paise, valid_from)
           SELECT $1, $2, 1, $3, $4
           WHERE NOT EXISTS (SELECT 1 FROM price.list_items WHERE price_list_id = $1 AND item_id = $2 AND min_qty = 1)`,
          [web, itemId, Math.round(pack.price * 100), PRICES_FROM],
        );
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  log(`added: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}`);
  return counts;
}

// Run directly: npm run db:seed
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { poolFor, db, closeDb } = await import('../src/db/pool.js');
  const local = Boolean(process.env.MIGRATE_DATABASE_URL);
  if (!local) process.env.DB_POOL_MAX = '1';
  const pool = local ? await poolFor(process.env.MIGRATE_DATABASE_URL, 1) : await db();
  try {
    await seed(pool);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    if (local) await pool.end();
    else await closeDb();
  }
}
