-- Parties: everyone Cholan buys from or sells to, in one table, so a mill that
-- also buys from Cholan is one record. Customers carry their segment, price
-- list and credit terms; suppliers their type. Contacts and addresses (with
-- the state code that decides CGST+SGST or IGST) hang off the party.

CREATE SCHEMA party;
GRANT USAGE ON SCHEMA party TO cholan_app, cholan_read;

CREATE TABLE party.parties (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('business', 'person')),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 2 AND 120),
  legal_name text,
  gstin text UNIQUE CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  pan text CHECK (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  phone text CHECK (phone ~ '^\+91[6-9][0-9]{9}$'),     -- +91 and the 10-digit mobile
  email text CHECK (email = lower(email)),
  is_customer boolean NOT NULL DEFAULT false,
  is_supplier boolean NOT NULL DEFAULT false,
  salesdaddy_lead_id text,
  tally_ledger_name text UNIQUE,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor(),
  CHECK (is_customer OR is_supplier),
  CHECK (gstin IS NULL OR pan IS NULL OR substr(gstin, 3, 10) = pan)
);
-- A household is found again by its mobile number.
CREATE UNIQUE INDEX parties_person_phone ON party.parties (phone) WHERE kind = 'person' AND phone IS NOT NULL;
CREATE INDEX parties_phone ON party.parties (phone);
CREATE INDEX parties_name ON party.parties (lower(display_name));
SELECT core.track('party.parties');

CREATE TABLE party.customer_profiles (
  party_id bigint PRIMARY KEY REFERENCES party.parties,
  segment text NOT NULL CHECK (segment IN ('b2c', 'retailer', 'hotel', 'distributor', 'institution')),
  price_list_id smallint NOT NULL REFERENCES price.price_lists,
  credit_limit_paise bigint NOT NULL DEFAULT 0 CHECK (credit_limit_paise >= 0),
  terms_days smallint NOT NULL DEFAULT 0 CHECK (terms_days BETWEEN 0 AND 180),
  credit_status text NOT NULL DEFAULT 'active' CHECK (credit_status IN ('active', 'hold', 'blocked')),
  salesperson_id integer REFERENCES org.users,
  home_branch_id smallint REFERENCES org.branches,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor()
);
SELECT core.track('party.customer_profiles');

CREATE TABLE party.supplier_profiles (
  party_id bigint PRIMARY KEY REFERENCES party.parties,
  supplier_type text NOT NULL CHECK (supplier_type IN ('mill', 'farmer', 'agent', 'packing', 'transport', 'other')),
  terms_days smallint NOT NULL DEFAULT 0 CHECK (terms_days BETWEEN 0 AND 180),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor()
);
SELECT core.track('party.supplier_profiles');

CREATE TABLE party.contacts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  party_id bigint NOT NULL REFERENCES party.parties,
  name text NOT NULL,
  role text,
  phone text CHECK (phone ~ '^\+91[6-9][0-9]{9}$'),
  email text CHECK (email = lower(email)),
  is_primary boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor()
);
CREATE INDEX contacts_party ON party.contacts (party_id);
SELECT core.track('party.contacts');

CREATE TABLE party.addresses (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  party_id bigint NOT NULL REFERENCES party.parties,
  kind text NOT NULL CHECK (kind IN ('billing', 'shipping', 'both')),
  label text,
  line1 text NOT NULL,
  line2 text,
  city text NOT NULL,
  district text,
  state_code char(2) NOT NULL CHECK (state_code ~ '^[0-9]{2}$'),
  pincode text NOT NULL CHECK (pincode ~ '^[1-9][0-9]{5}$'),
  gstin text CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor(),
  CHECK (gstin IS NULL OR left(gstin, 2) = state_code)
);
CREATE INDEX addresses_party ON party.addresses (party_id);
CREATE UNIQUE INDEX addresses_one_default ON party.addresses (party_id, kind) WHERE is_default AND active;
SELECT core.track('party.addresses');

-- Special prices agreed with one customer, on top of their price list.
CREATE TABLE price.customer_prices (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  party_id bigint NOT NULL REFERENCES party.parties,
  item_id integer NOT NULL REFERENCES catalog.items,
  min_qty integer NOT NULL DEFAULT 1 CHECK (min_qty >= 1),
  price_paise bigint NOT NULL CHECK (price_paise > 0),
  valid_from date NOT NULL,
  valid_to date,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor(),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE INDEX customer_prices_lookup ON price.customer_prices (party_id, item_id, valid_from);
CREATE TRIGGER no_overlap BEFORE INSERT OR UPDATE ON price.customer_prices
  FOR EACH ROW EXECUTE FUNCTION price.no_overlap('party_id');
SELECT core.track('price.customer_prices');

-- The price a customer pays for qty of an item on a day: their special price
-- first, then their price list, then the default (website) list. Within each,
-- the biggest slab the quantity reaches wins. Frozen onto the order line later.
CREATE FUNCTION price.resolve(p_party bigint, p_item integer, p_qty integer, p_on date DEFAULT current_date)
RETURNS TABLE (price_paise bigint, includes_gst boolean, source text)
LANGUAGE sql STABLE
AS $$
  WITH own_list AS (
    SELECT pl.* FROM party.customer_profiles cp JOIN price.price_lists pl ON pl.id = cp.price_list_id
    WHERE cp.party_id = p_party AND pl.active
  ),
  default_list AS (SELECT * FROM price.price_lists WHERE is_default AND active),
  candidates AS (
    SELECT c.price_paise, coalesce((SELECT includes_gst FROM own_list), (SELECT includes_gst FROM default_list)) AS includes_gst,
           'special' AS source, 1 AS rank, c.min_qty
    FROM price.customer_prices c
    WHERE c.party_id = p_party AND c.item_id = p_item AND c.min_qty <= p_qty
      AND p_on BETWEEN c.valid_from AND coalesce(c.valid_to, 'infinity'::date)
    UNION ALL
    SELECT li.price_paise, l.includes_gst, 'list:' || l.code, 2, li.min_qty
    FROM price.list_items li JOIN own_list l ON l.id = li.price_list_id
    WHERE li.item_id = p_item AND li.min_qty <= p_qty
      AND p_on BETWEEN li.valid_from AND coalesce(li.valid_to, 'infinity'::date)
    UNION ALL
    SELECT li.price_paise, d.includes_gst, 'list:' || d.code, 3, li.min_qty
    FROM price.list_items li JOIN default_list d ON d.id = li.price_list_id
    WHERE li.item_id = p_item AND li.min_qty <= p_qty
      AND p_on BETWEEN li.valid_from AND coalesce(li.valid_to, 'infinity'::date)
  )
  SELECT price_paise, includes_gst, source FROM candidates ORDER BY rank, min_qty DESC LIMIT 1
$$;
