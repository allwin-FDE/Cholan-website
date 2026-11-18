-- Organisation: the company, its GST registrations, branches and their storage
-- places, and the staff who use the system with their role in each branch.

CREATE SCHEMA org;
GRANT USAGE ON SCHEMA org TO cholan_app, cholan_read;

-- One row: the company itself.
CREATE TABLE org.company (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  legal_name text NOT NULL,
  brand_name text NOT NULL,
  cin text CHECK (cin ~ '^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$'),
  pan text CHECK (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  phone text,
  email text CHECK (email = lower(email)),
  website text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor()
);
SELECT core.track('org.company');

-- One per state the company is registered in. Invoices are numbered and taxed
-- per registration.
CREATE TABLE org.gst_registrations (
  id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gstin text NOT NULL UNIQUE CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  state_code char(2) NOT NULL CHECK (state_code ~ '^[0-9]{2}$'),
  legal_name text NOT NULL,
  address text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor(),
  CHECK (left(gstin, 2) = state_code)
);
SELECT core.track('org.gst_registrations');

CREATE TABLE org.branches (
  id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{2,6}$'),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('store', 'warehouse', 'mill', 'office')),
  gst_registration_id smallint NOT NULL REFERENCES org.gst_registrations,
  address_line1 text NOT NULL,
  address_line2 text,
  city text NOT NULL,
  pincode text NOT NULL CHECK (pincode ~ '^[1-9][0-9]{5}$'),
  state_code char(2) NOT NULL CHECK (state_code ~ '^[0-9]{2}$'),
  phone text,
  fssai_licence text CHECK (fssai_licence ~ '^[0-9]{14}$'),
  holds_stock boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor()
);
SELECT core.track('org.branches');

-- Where stock sits inside a branch. "in_transit" holds bags moving between
-- branches; "damaged" keeps spoilt bags out of what can be sold.
CREATE TABLE org.locations (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id smallint NOT NULL REFERENCES org.branches,
  code text NOT NULL CHECK (code ~ '^[A-Z0-9-]{1,12}$'),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('godown', 'shelf', 'damaged', 'in_transit')),
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor(),
  UNIQUE (branch_id, code)
);
SELECT core.track('org.locations');

-- Staff, matched to their Firebase sign-in by email (and uid once seen).
CREATE TABLE org.users (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  firebase_uid text UNIQUE,
  name text NOT NULL,
  phone text,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor()
);
SELECT core.track('org.users');

-- One role per person per branch; an empty branch means every branch. A role
-- is switched off with "active", never deleted, so its history stays.
CREATE TABLE org.user_roles (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id integer NOT NULL REFERENCES org.users,
  branch_id smallint REFERENCES org.branches,
  role text NOT NULL CHECK (role IN ('staff', 'manager', 'admin', 'owner')),
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor(),
  UNIQUE NULLS NOT DISTINCT (user_id, branch_id)
);
SELECT core.track('org.user_roles');
