-- Price lists: one per kind of customer (website/MRP, retail, hotel,
-- distributor, institution). Each price has the dates it applies and an
-- optional minimum quantity (a slab: cheaper per bag from 10 bags, say).
-- Two prices for the same list, item and slab may never cover the same day.

CREATE SCHEMA price;
GRANT USAGE ON SCHEMA price TO cholan_app, cholan_read;

CREATE TABLE price.price_lists (
  id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z][A-Z0-9_]{1,11}$'),
  name text NOT NULL,
  includes_gst boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,            -- the price when nothing else applies
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor()
);
CREATE UNIQUE INDEX price_lists_one_default ON price.price_lists (is_default) WHERE is_default;
SELECT core.track('price.price_lists');

CREATE TABLE price.list_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  price_list_id smallint NOT NULL REFERENCES price.price_lists,
  item_id integer NOT NULL REFERENCES catalog.items,
  min_qty integer NOT NULL DEFAULT 1 CHECK (min_qty >= 1),
  price_paise bigint NOT NULL CHECK (price_paise > 0),
  valid_from date NOT NULL,
  valid_to date,                                        -- empty: until further notice
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor(),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE INDEX list_items_lookup ON price.list_items (price_list_id, item_id, valid_from);
SELECT core.track('price.list_items');

-- Refuses a price whose dates overlap another for the same owner (list or
-- customer), item and slab. TG_ARGV[0] names the owner column. A lock per
-- owner and item stops two people saving clashing prices at the same moment.
CREATE FUNCTION price.no_overlap() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  owner_id bigint := (to_jsonb(NEW) ->> TG_ARGV[0])::bigint;
  clash bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(TG_TABLE_NAME || ':' || owner_id || ':' || NEW.item_id));
  EXECUTE format(
    'SELECT id FROM %I.%I WHERE %I = $1 AND item_id = $2 AND min_qty = $3 AND id IS DISTINCT FROM $4
       AND daterange(valid_from, valid_to, ''[]'') && daterange($5, $6, ''[]'') LIMIT 1',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_ARGV[0])
  INTO clash
  USING owner_id, NEW.item_id, NEW.min_qty, NEW.id, NEW.valid_from, NEW.valid_to;
  IF clash IS NOT NULL THEN
    RAISE EXCEPTION 'This price overlaps the dates of another price for the same item and quantity (row %).', clash
      USING ERRCODE = 'exclusion_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER no_overlap BEFORE INSERT OR UPDATE ON price.list_items
  FOR EACH ROW EXECUTE FUNCTION price.no_overlap('price_list_id');

INSERT INTO price.price_lists (code, name, includes_gst, is_default) VALUES
  ('WEB', 'Website and MRP price', true, true),
  ('RETAIL', 'Retail shops and grocers', true, false),
  ('HOTEL', 'Hotels, restaurants and caterers', true, false),
  ('DIST', 'Distributors and wholesalers', true, false),
  ('INST', 'Institutions', true, false);
