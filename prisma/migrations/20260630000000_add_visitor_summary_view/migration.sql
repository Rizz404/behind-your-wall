-- One row per visitor, combining identity, location, and most recent visit/device/site info.
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
    latest.ip AS "lastIp"
FROM "visitors" v
LEFT JOIN LATERAL (
    SELECT *
    FROM "visit_logs" vl
    WHERE vl.visitor_id = v.id
    ORDER BY vl.created_at DESC
    LIMIT 1
) latest ON true
LEFT JOIN "sites" s ON s.id = latest.site_id;
