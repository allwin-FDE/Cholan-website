-- Where each website order came from: Google Ads, Meta Ads, LinkedIn,
-- Google search, WhatsApp, Direct and so on (backend/src/lib/sources.js),
-- with the ad campaign and the visit that placed it. Used by the Sources
-- report in /admin. One row per website order, written when it is placed.
--
--   channel / source / medium / campaign  what the order counts for: this
--       visit's source, or, when this visit came straight to the site, the
--       last visit with a source in the past 30 days (touch_from says which)
--   first_*   the first source this device was ever seen with
--   click_id  the kind of ad click id on the link (gclid, fbclid…), never its value

CREATE TABLE sales.order_attribution (
  order_id bigint PRIMARY KEY REFERENCES sales.orders,
  channel text NOT NULL CHECK (length(channel) BETWEEN 1 AND 60),
  source text CHECK (length(source) <= 120),
  medium text CHECK (length(medium) <= 120),
  campaign text CHECK (length(campaign) <= 120),
  click_id text CHECK (click_id IN ('gclid', 'gbraid', 'wbraid', 'msclkid', 'li_fat_id', 'ttclid', 'fbclid')),
  landing text CHECK (length(landing) <= 200),
  referrer text CHECK (length(referrer) <= 300),
  touch_at timestamptz,
  touch_from text CHECK (touch_from IN ('this visit', 'an earlier visit')),
  first_channel text CHECK (length(first_channel) <= 60),
  first_source text CHECK (length(first_source) <= 120),
  first_campaign text CHECK (length(first_campaign) <= 120),
  first_at timestamptz,
  session_id text CHECK (length(session_id) <= 64),
  visitor_id text CHECK (length(visitor_id) <= 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor()
);
CREATE INDEX order_attribution_channel ON sales.order_attribution (channel);
SELECT core.track('sales.order_attribution');
