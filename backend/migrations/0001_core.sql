-- Core: helpers every module uses, settings, and the audit log.
--
-- Every tracked table records who changed it last (updated_at, updated_by), and
-- every insert, change or delete on it is kept in core.audit_log with the old
-- and new values. The website can read the log but never write or edit it.

-- Nothing is open by default. Each module grants exactly what it needs, and
-- every table the owner makes gives the website read, add and update rights,
-- never delete.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE cholan_owner GRANT SELECT, INSERT, UPDATE ON TABLES TO cholan_app;
ALTER DEFAULT PRIVILEGES FOR ROLE cholan_owner GRANT USAGE, SELECT ON SEQUENCES TO cholan_app;

GRANT USAGE ON SCHEMA core TO cholan_app, cholan_read;
REVOKE ALL ON core.schema_migrations FROM cholan_app;
GRANT SELECT ON core.schema_migrations TO cholan_app;

-- Who is acting: the website sets app.actor (a staff email) in each
-- transaction; otherwise it is the database login.
CREATE FUNCTION core.actor() RETURNS text
LANGUAGE sql STABLE
AS $$ SELECT coalesce(nullif(current_setting('app.actor', true), ''), session_user::text) $$;

CREATE TABLE core.audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL,
  table_name text NOT NULL,
  row_id text,
  action text NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  old_row jsonb,
  new_row jsonb
);
CREATE INDEX audit_log_row ON core.audit_log (table_name, row_id, at);
CREATE INDEX audit_log_at ON core.audit_log (at);
REVOKE INSERT, UPDATE ON core.audit_log FROM cholan_app;

-- Runs as the owner (SECURITY DEFINER), so the log is written even though the
-- website itself may not write to it.
CREATE FUNCTION core.audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, core
AS $$
DECLARE
  old_j jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  new_j jsonb := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END;
  row_key jsonb := coalesce(new_j, old_j);
BEGIN
  -- A save that changed nothing but the "last changed" stamp is not logged.
  IF TG_OP = 'UPDATE' AND (old_j - 'updated_at' - 'updated_by') = (new_j - 'updated_at' - 'updated_by') THEN
    RETURN NEW;
  END IF;
  INSERT INTO core.audit_log (actor, table_name, row_id, action, old_row, new_row)
  VALUES (core.actor(), TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
          coalesce(row_key ->> 'id', row_key ->> 'party_id', row_key ->> 'key'),
          lower(TG_OP), old_j, new_j);
  RETURN coalesce(NEW, OLD);
END
$$;

CREATE FUNCTION core.touch() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := core.actor();
  RETURN NEW;
END
$$;

-- core.track('schema.table'): stamps and audits a table. The table must have
-- updated_at and updated_by columns.
CREATE FUNCTION core.track(rel regclass) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('CREATE TRIGGER touch BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION core.touch()', rel);
  EXECUTE format('CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION core.audit()', rel);
END
$$;
REVOKE EXECUTE ON FUNCTION core.track(regclass) FROM PUBLIC;

CREATE TABLE core.settings (
  key text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_.]{1,60}$'),
  value jsonb NOT NULL,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor()
);
SELECT core.track('core.settings');

INSERT INTO core.settings (key, value, note) VALUES
  ('gst.b2cl_limit_paise', '10000000', 'An interstate invoice to an unregistered buyer above this (Rs 1,00,000) is B2C Large in GSTR-1.'),
  ('gst.default_hsn', '"1006"', 'HSN code for rice.'),
  ('sales.round_to_rupee', 'true', 'Invoice totals are rounded to the rupee, with the round-off shown.');
