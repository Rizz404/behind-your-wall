-- Add User-Agent Client Hints and HTML5 Geolocation columns to visit_logs
ALTER TABLE "visit_logs"
  ADD COLUMN "ua_brands"           jsonb,
  ADD COLUMN "ua_mobile"           boolean,
  ADD COLUMN "ua_platform"         varchar(200),
  ADD COLUMN "ua_platform_version" varchar(100),
  ADD COLUMN "geo_lat"             double precision,
  ADD COLUMN "geo_lon"             double precision,
  ADD COLUMN "geo_accuracy"        double precision;

-- Add raw UA Client Hints payload to fingerprint_components
ALTER TABLE "fingerprint_components"
  ADD COLUMN "ua_ch_raw" jsonb;

-- Recreate visitor_summary view to include new UA-CH and geo columns
CREATE OR REPLACE VIEW "visitor_summary" AS
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
    latest.geo_lon AS "lastGeoLon"
FROM "visitors" v
LEFT JOIN LATERAL (
    SELECT *
    FROM "visit_logs" vl
    WHERE vl.visitor_id = v.id
    ORDER BY vl.created_at DESC
    LIMIT 1
) latest ON true
LEFT JOIN "sites" s ON s.id = latest.site_id;
