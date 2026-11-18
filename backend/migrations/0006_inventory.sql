-- Stock: every bag in or out is one row in inv.stock_moves, which is never
-- edited. inv.stock_balances (bags in hand, reserved for confirmed orders,
-- damaged) follows from the moves through a trigger, and can never go below
-- zero or reserve more than is in hand. The website may add moves; it can
-- never write the balances directly or change a move.

CREATE SCHEMA inv;
GRANT USAGE ON SCHEMA inv TO cholan_app, cholan_read;

CREATE TABLE inv.stock_balances (
  location_id integer NOT NULL REFERENCES org.locations,
  item_id integer NOT NULL REFERENCES catalog.items,
  on_hand integer NOT NULL DEFAULT 0 CHECK (on_hand >= 0),     -- good bags in the place
  reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0),   -- of those, promised to confirmed orders
  damaged integer NOT NULL DEFAULT 0 CHECK (damaged >= 0),     -- kept apart, not for sale
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (location_id, item_id),
  CONSTRAINT stock_balances_reserved_le_on_hand CHECK (reserved <= on_hand)
);
REVOKE INSERT, UPDATE ON inv.stock_balances FROM cholan_app;

CREATE TABLE inv.stock_moves (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL DEFAULT core.actor(),
  location_id integer NOT NULL REFERENCES org.locations,
  item_id integer NOT NULL REFERENCES catalog.items,
  type text NOT NULL CHECK (type IN ('opening', 'receive', 'adjust', 'reserve', 'release', 'dispatch', 'return', 'return_damaged', 'damage', 'write_off')),
  on_hand_change integer NOT NULL DEFAULT 0,
  reserved_change integer NOT NULL DEFAULT 0,
  damaged_change integer NOT NULL DEFAULT 0,
  on_hand_after integer,                      -- filled in from the balance
  reserved_after integer,
  damaged_after integer,
  ref_type text CHECK (ref_type IN ('order', 'return', 'adjustment')),
  ref_id bigint,
  ref_number text,
  reason text,
  CHECK (on_hand_change <> 0 OR reserved_change <> 0 OR damaged_change <> 0)
);
CREATE INDEX stock_moves_item ON inv.stock_moves (item_id, at);
CREATE INDEX stock_moves_ref ON inv.stock_moves (ref_type, ref_id);
REVOKE UPDATE ON inv.stock_moves FROM cholan_app;

-- Applies a move to its balance (as the owner, since the website may not
-- write balances). The balance row is locked while this runs, so two orders
-- for the last bags are taken one after the other and the second is refused.
CREATE FUNCTION inv.apply_move() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, inv
AS $$
DECLARE
  b inv.stock_balances;
BEGIN
  INSERT INTO inv.stock_balances (location_id, item_id) VALUES (NEW.location_id, NEW.item_id) ON CONFLICT DO NOTHING;
  UPDATE inv.stock_balances
     SET on_hand = on_hand + NEW.on_hand_change,
         reserved = reserved + NEW.reserved_change,
         damaged = damaged + NEW.damaged_change,
         updated_at = now()
   WHERE location_id = NEW.location_id AND item_id = NEW.item_id
  RETURNING * INTO b;
  NEW.on_hand_after := b.on_hand;
  NEW.reserved_after := b.reserved;
  NEW.damaged_after := b.damaged;
  NEW.actor := coalesce(NEW.actor, core.actor());
  RETURN NEW;
END
$$;
CREATE TRIGGER apply BEFORE INSERT ON inv.stock_moves FOR EACH ROW EXECUTE FUNCTION inv.apply_move();

-- What each pack has, per place, with what can still be promised.
CREATE VIEW inv.stock AS
SELECT b.location_id, l.branch_id, l.code AS location_code, b.item_id, b.on_hand, b.reserved, b.damaged,
       b.on_hand - b.reserved AS available, i.low_stock_level,
       (i.low_stock_level IS NOT NULL AND b.on_hand - b.reserved <= i.low_stock_level) AS low,
       b.updated_at
FROM inv.stock_balances b
JOIN org.locations l ON l.id = b.location_id
JOIN catalog.items i ON i.id = b.item_id;
