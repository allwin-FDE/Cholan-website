-- Catalogue: products, and every item Cholan buys, packs or sells. A finished
-- item is one product in one pack size (Chennai Pattinam Ponni, 26 kg), with
-- its own HSN and GST rate, because the rate can differ by pack size (packs
-- over 25 kg are not "pre-packaged" for GST). Raw rice, paddy and empty bags
-- are items too, so goods inward and packing can be tracked.

CREATE SCHEMA catalog;
GRANT USAGE ON SCHEMA catalog TO cholan_app, cholan_read;

CREATE TABLE catalog.categories (
  id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor()
);
SELECT core.track('catalog.categories');

CREATE TABLE catalog.products (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'), -- the website's product id
  name text NOT NULL,
  tamil_name text,
  category_id smallint NOT NULL REFERENCES catalog.categories,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor()
);
SELECT core.track('catalog.products');

CREATE TABLE catalog.items (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('finished', 'raw', 'packing', 'other')),
  product_id integer REFERENCES catalog.products,
  sku_code text NOT NULL UNIQUE CHECK (sku_code ~ '^[A-Z0-9][A-Z0-9-]{1,23}$'),
  name text NOT NULL,
  pack_label text,                                      -- as printed on the bag, e.g. '26 kg'
  net_weight_g integer CHECK (net_weight_g > 0),
  uom text NOT NULL CHECK (uom IN ('bag', 'kg', 'quintal', 'piece')),
  hsn text NOT NULL CHECK (hsn ~ '^[0-9]{4}([0-9]{2}){0,2}$'),
  gst_rate_bp smallint NOT NULL CHECK (gst_rate_bp BETWEEN 0 AND 4000),  -- 500 = 5%
  gst_confirmed boolean NOT NULL DEFAULT false,         -- true once the CA has checked the rate
  mrp_paise bigint CHECK (mrp_paise > 0),               -- as printed on the pack
  barcode text UNIQUE CHECK (barcode ~ '^[0-9]{8,14}$'),
  low_stock_level integer CHECK (low_stock_level >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor(),
  UNIQUE (product_id, pack_label),
  CHECK (kind <> 'finished' OR (product_id IS NOT NULL AND pack_label IS NOT NULL AND net_weight_g IS NOT NULL))
);
CREATE INDEX items_product ON catalog.items (product_id);
SELECT core.track('catalog.items');
