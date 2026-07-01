-- Add client-side timezone to visit_logs (distinct from visitors.timezone which comes from IP enrichment)
ALTER TABLE "visit_logs"
  ADD COLUMN "timezone" varchar(100);

-- Add timezone-derived country to visitors (VPN-resistant alternative to IP-based country)
ALTER TABLE "visitors"
  ADD COLUMN "timezone_country" varchar(10);

-- DROP + CREATE is required because CREATE OR REPLACE VIEW does not allow inserting new columns
-- in the middle of an existing column list — PostgreSQL would treat it as a column rename.
DROP VIEW IF EXISTS "visitor_summary";
CREATE VIEW "visitor_summary" AS
SELECT
    v.id AS "visitorId",
    v.fingerprint_id AS "fingerprintId",
    v.visit_count AS "visitCount",
    v.first_seen_at AS "firstSeenAt",
    v.last_seen_at AS "lastSeenAt",
    v.country,
    v.city,
    v.isp,
    v.timezone,
    v.timezone_country AS "timezoneCountry",
    s.id AS "siteId",
    s.name AS "siteName",
    s.domain AS "siteDomain",
    latest.page_url AS "lastPageUrl",
    latest.referrer AS "lastReferrer",
    latest.browser AS "lastBrowser",
    latest.os AS "lastOs",
    latest.device_type AS "lastDeviceType",
    latest.screen_res AS "lastScreenRes",
    latest.language AS "lastLanguage",
    latest.ip AS "lastIp",
    latest.ua_mobile AS "lastUaMobile",
    latest.ua_platform AS "lastUaPlatform",
    latest.geo_lat AS "lastGeoLat",
    latest.geo_lon AS "lastGeoLon",
    latest.timezone AS "lastTimezone"
FROM "visitors" v
LEFT JOIN LATERAL (
    SELECT *
    FROM "visit_logs" vl
    WHERE vl.visitor_id = v.id
    ORDER BY vl.created_at DESC
    LIMIT 1
) latest ON true
LEFT JOIN "sites" s ON s.id = latest.site_id;
