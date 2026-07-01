# Plan — Fingerprint & IP Tracker (NestJS)

## Context

`unfinished-plan.md` di root project berisi rancangan sistem fingerprint & IP tracker dalam 3 alternatif stack (NestJS, Spring Boot, Go) plus bagian yang sama di ketiganya (schema DB, Redis, API contract, alur data, client SDK, deployment, fase pengerjaan). Sudah diputuskan: **pakai versi NestJS**. Project ini sudah selesai diimplementasikan dan berjalan di production.

Keputusan yang sudah diambil:
- Admin auth punya tabel `admins` di database, supaya upgrade ke multi-admin di Phase 4 tidak perlu migrasi tambahan.
- **ORM: Prisma 7** (rilis November 2025, engine full TypeScript tanpa binary Rust). Prisma 7 mewajibkan driver adapter — connection string dikonfigurasi di `prisma.config.ts` (untuk CLI) dan lewat `@prisma/adapter-pg` (`PrismaPg`) di runtime.
- **Redis dijadikan optional**: app berfungsi penuh tanpa Redis, cukup gunakan no-op cache.
- **Production di relay.fts-tech.co.id** (Plesk Hostinger, Node 25 via nodenv, Passenger).

---

## Tech Stack (Implemented)

| Komponen | Pilihan | Versi | Keterangan |
| --- | --- | --- | --- |
| Runtime | Node.js | 25 | Production menggunakan Node 25 via nodenv (`.node-version` file) |
| Framework | NestJS | 11.x (Express v5) | |
| Language | TypeScript | 5.x | |
| ORM | Prisma | 7.x | Engine TS murni, tanpa binary Rust. Driver adapter wajib (`@prisma/adapter-pg`). |
| DB | PostgreSQL | 17.x | |
| Redis Client | node-redis | 6.0.0 | **Optional** — hanya dipakai kalau `REDIS_URL` di-set. |
| Auth | Passport JWT + bcrypt | 10.x | |
| Validasi | class-validator + class-transformer | 0.14.x + 0.5.x | |
| Rate limiting | @nestjs/throttler | latest | |
| HTTP client (enrichment) | @nestjs/axios | latest | |
| Process manager | Passenger (Plesk) | — | Production pakai Passenger bukan PM2 langsung |

---

## Arsitektur Modul

```
AppModule
├── ConfigModule (global)
├── PrismaModule (global)       — wrapper PrismaClient, OnModuleInit ($connect) / OnModuleDestroy ($disconnect)
├── CacheModule (global)        — abstraksi cache; backing Redis kalau REDIS_URL ada, else No-op
├── AuthModule                  — login admin (tabel `admins`), JWT strategy
├── SitesModule                 — CRUD site + generate API key
├── TrackModule                 — POST /v1/sync
├── VisitorsModule              — Visitor/VisitLog/FingerprintComponent + admin endpoints + summary view
├── BlocklistModule             — CRUD blocked IP + sync ke cache
├── AnalyticsModule             — summary & chart
└── IpEnricherModule            — panggil ip-api.com, async non-blocking
```

Dua guard inti: `SiteKeyGuard` (header `X-Site-Key`, DB + cache 5 menit) dan `JwtAuthGuard` (Bearer token, endpoint admin). IP asli client dibaca via decorator `@GetIp()`: prioritas `CF-Connecting-IP` → `X-Forwarded-For` → `req.ip`.

### Desain "Redis optional" via `CacheModule`

Interface `CacheService` (`get`/`set`/`del`/`isEnabled`) dengan dua implementasi:

- `RedisCacheService` — dipakai kalau `REDIS_URL` ter-set.
- `NoopCacheService` — dipakai kalau tidak. `get()` selalu return `null`, `set()`/`del()` no-op.

`CacheModule` adalah dynamic module yang memilih implementasi lewat factory provider berdasarkan `ConfigService.get('REDIS_URL')`. Cache miss selalu berarti "tanya DB" — tidak ada cabang kode tambahan di guard/service.

---

## Struktur Folder

```
prisma.config.ts          # connection string untuk Prisma CLI (migrate/generate)
prisma/
├── schema.prisma
├── seed.ts
└── migrations/
    ├── 20260629000000_init/
    ├── 20260630000000_add_visitor_summary_view/
    └── 20260701000000_add_ua_hints_and_geo/

src/
├── main.ts
├── app.module.ts
├── config/
│   ├── configuration.ts
│   └── env.validation.ts
├── prisma/
│   ├── prisma.module.ts
│   └── prisma.service.ts
├── cache/
│   ├── cache.module.ts
│   ├── cache.interface.ts
│   ├── redis-cache.service.ts
│   └── noop-cache.service.ts
├── common/
│   ├── decorators/get-ip.decorator.ts
│   ├── decorators/current-admin.decorator.ts
│   ├── decorators/current-site.decorator.ts
│   ├── guards/site-key.guard.ts
│   ├── guards/jwt-auth.guard.ts
│   └── utils/ip.util.ts
├── auth/
│   ├── auth.module.ts / auth.controller.ts / auth.service.ts
│   ├── strategies/jwt.strategy.ts
│   └── dto/login.dto.ts
├── sites/
│   ├── sites.module.ts / sites.controller.ts / sites.service.ts
│   └── dto/create-site.dto.ts
├── track/
│   ├── track.module.ts / track.controller.ts / track.service.ts
│   └── dto/track.dto.ts
├── visitors/
│   ├── visitors.module.ts / visitors.controller.ts / visitors.service.ts
│   └── dto/list-visitors-query.dto.ts
├── blocklist/
│   ├── blocklist.module.ts / blocklist.controller.ts / blocklist.service.ts
│   └── dto/create-blocked-ip.dto.ts
├── analytics/
│   └── analytics.module.ts / analytics.controller.ts / analytics.service.ts
└── ip-enricher/
    └── ip-enricher.module.ts / ip-enricher.service.ts

sdk/widget.js          # static file, disajikan via NestJS static middleware di /static/
test/                  # e2e specs
ecosystem.config.js    # pm2 config (tidak dipakai di production Plesk, tapi tersedia)
```

---

## Database Schema (PostgreSQL 17, via Prisma)

### Model

```prisma
model Site {
  id        String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name      String
  domain    String     @unique
  apiKey    String     @unique @map("api_key")
  isActive  Boolean    @default(true) @map("is_active")
  createdAt DateTime   @default(now()) @map("created_at") @db.Timestamptz(3)
  visitLogs VisitLog[]
  @@map("sites")
}

model Visitor {
  id                   String                @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  fingerprintId        String                @unique @map("fingerprint_id")
  visitCount           Int                   @default(1) @map("visit_count")
  country              String?
  city                 String?
  isp                  String?
  timezone             String?
  timezoneCountry      String?               @map("timezone_country")  -- ISO code derived from client timezone, VPN-resistant
  firstSeenAt          DateTime              @default(now()) @map("first_seen_at") @db.Timestamptz(3)
  lastSeenAt           DateTime              @default(now()) @map("last_seen_at") @db.Timestamptz(3)
  visitLogs            VisitLog[]
  fingerprintComponent FingerprintComponent?
  @@map("visitors")
}

model VisitLog {
  id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  visitorId         String   @map("visitor_id") @db.Uuid
  siteId            String?  @map("site_id") @db.Uuid
  ip                String   @db.VarChar(45)
  pageUrl           String?  @map("page_url")
  referrer          String?
  userAgent         String?  @map("user_agent")
  browser           String?
  os                String?
  deviceType        String?  @map("device_type")
  screenRes         String?  @map("screen_res")
  language          String?
  timezone          String?  @db.VarChar(100)              -- client-side timezone from widget
  // User-Agent Client Hints
  uaBrands          Json?    @map("ua_brands")
  uaMobile          Boolean? @map("ua_mobile")
  uaPlatform        String?  @map("ua_platform") @db.VarChar(200)
  uaPlatformVersion String?  @map("ua_platform_version") @db.VarChar(100)
  // HTML5 Geolocation (opt-in via data-geo="true")
  geoLat            Float?   @map("geo_lat")
  geoLon            Float?   @map("geo_lon")
  geoAccuracy       Float?   @map("geo_accuracy")
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  @@index([visitorId])
  @@index([createdAt])
  @@map("visit_logs")
}

model FingerprintComponent {
  id         String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  visitorId  String  @unique @map("visitor_id") @db.Uuid
  canvasHash String? @map("canvas_hash")
  webglHash  String? @map("webgl_hash")
  audioHash  String? @map("audio_hash")
  raw        Json?
  uaChRaw    Json?   @map("ua_ch_raw")   -- raw high-entropy UA Client Hints response
  @@map("fingerprint_components")
}
```

### View: visitor_summary

PostgreSQL view yang menggabungkan data visitor, geolokasi IP, dan visit log terakhir per visitor. Dipakai oleh `GET /v1/visitors/summary`. Dikelola manual lewat migration SQL (bukan Prisma Migrate DDL) karena Prisma belum generate DDL untuk view secara native.

Kolom view: `visitorId`, `fingerprintId`, `visitCount`, `firstSeenAt`, `lastSeenAt`, `country`, `city`, `isp`, `timezone`, `siteId`, `siteName`, `siteDomain`, `lastPageUrl`, `lastReferrer`, `lastBrowser`, `lastOs`, `lastDeviceType`, `lastScreenRes`, `lastLanguage`, `lastIp`, `lastUaMobile`, `lastUaPlatform`, `lastGeoLat`, `lastGeoLon`.

---

## API Endpoints (Implemented)

| Method | Path | Auth | Keterangan |
|---|---|---|---|
| POST | `/v1/auth/login` | — | Login admin, return JWT |
| GET | `/v1/sites` | JWT | List semua site |
| POST | `/v1/sites` | JWT | Buat site baru + generate API key |
| DELETE | `/v1/sites/:id` | JWT | Nonaktifkan site |
| POST | `/v1/sync` | Site-Key | Sync kunjungan dari widget.js |
| GET | `/v1/visitors` | JWT | List visitor dengan pagination + filter |
| GET | `/v1/visitors/summary` | JWT | List via visitor_summary view (lebih efisien) |
| GET | `/v1/visitors/:fingerprintId` | JWT | Detail visitor + 50 log terakhir |
| GET | `/v1/blocklist` | JWT | List semua blocked IP |
| POST | `/v1/blocklist` | JWT | Tambah IP ke blocklist |
| DELETE | `/v1/blocklist/:ip` | JWT | Hapus IP dari blocklist |
| GET | `/v1/blocklist/check/:ip` | — | Cek apakah IP diblokir |
| GET | `/v1/analytics/overview` | JWT | Total visitor, top countries, chart 30 hari |

---

## Sinyal yang Dikumpulkan widget.js

### FingerprintJS v4
- `fingerprintId` — stable visitor ID
- `canvasHash`, `webglHash`, `audioHash` — hash komponen hardware
- `rawComponents` — raw signal components (JSON)

### User-Agent String (parsing sisi widget)
- `userAgent` — UA string lengkap (`navigator.userAgent`)
- `browser` — Chrome / Firefox / Safari / Edge / Opera (parsed regex)
- `os` — Windows / macOS / Android / iOS / Linux
- `deviceType` — desktop / mobile / tablet

### User-Agent Client Hints (Chromium 90+)
- `uaBrands` — array `{brand, version}` dari `fullVersionList` atau `brands`
- `uaMobile` — boolean, lebih akurat dari UA string parsing
- `uaPlatform` — nama OS tanpa spoofing (misal "Windows" / "Android")
- `uaPlatformVersion` — versi OS (misal "15.0.0" = Windows 11)
- `uaChRaw` — raw response `getHighEntropyValues()` lengkap (disimpan di `fingerprint_components`)

Firefox dan Safari tidak mengimplementasikan UA-CH — field-field ini akan kosong untuk browser tersebut.

### Browser APIs
- `screenRes` — `window.screen.width + 'x' + window.screen.height`
- `language` — `navigator.language`
- `timezone` — `Intl.DateTimeFormat().resolvedOptions().timeZone`
- `pageUrl`, `referrer`

### HTML5 Geolocation API (opt-in)
- Hanya aktif jika `data-geo="true"` dipasang di tag script — tidak ada dialog izin tanpa atribut ini
- `geoLat`, `geoLon` — koordinat fisik, akurasi tinggi (GPS/WiFi/cell)
- `geoAccuracy` — radius akurasi dalam meter
- `data-geo-trigger="#selector"` — jika diisi, dialog izin baru muncul saat elemen diklik. Jika permission sudah granted, koordinat diambil diam-diam tanpa dialog. Data geo dikirim via secondary POST /v1/sync setelah klik.
- Timeout 3 detik. Jika ditolak/timeout, field geo kosong dan tracking tetap berjalan normal.

### Timezone (semua browser, tanpa izin)
- `timezone` — `Intl.DateTimeFormat().resolvedOptions().timeZone` dari widget, disimpan per visit
- `timezoneCountry` — dipetakan server-side via `timezone-country.util.ts` (IANA → ISO 3166-1 alpha-2), disimpan di `visitors`. VPN tidak mempengaruhi timezone OS, sehingga field ini lebih akurat dari IP geo untuk deteksi negara.

### IP (server-side)
- `ip` — dibaca dari header `CF-Connecting-IP` → `X-Forwarded-For` → `req.ip`
- `country`, `city`, `isp` — enrichment via ip-api.com (fire-and-forget, sekali per visitor baru). Tidak akurat jika user pakai VPN.

---

## Alur Data (POST /v1/sync)

1. `widget.js` load FingerprintJS v4 + paralel request UA-CH dan (jika `data-geo="true"` tanpa trigger, atau permission sudah granted) HTML5 Geolocation.
2. Setelah fingerprint ready, tunggu UA-CH + geo (sudah berjalan paralel).
3. POST ke `/v1/sync` dengan header `X-Site-Key` + payload lengkap termasuk timezone browser.
4. `SiteKeyGuard`: validasi API key via cache (Redis) atau DB (fallback/no-Redis).
5. Cek blocklist IP via cache atau DB.
6. Upsert visitor by `fingerprint_id` secara **atomic** via raw SQL (`INSERT ... ON CONFLICT`). Trik `(xmax = 0) AS is_new` mendeteksi insert vs update.
7. Jika visitor baru: trigger IP enrichment async (tidak di-await) + upsert `fingerprint_components` (termasuk `uaChRaw`).
8. Map `dto.timezone` → ISO country code via `getCountryFromTimezone()` (O(1) in-memory lookup). Update `visitor.timezoneCountry`.
9. Insert baris baru ke `visit_logs` (termasuk timezone, UA-CH fields, dan geo fields).
10. Return `{tracked: true, blocked: false}`.

### Upsert atomic via `$queryRaw`

```typescript
const rows = await this.prisma.$queryRaw<Array<{ id: string; visit_count: number; is_new: boolean }>>`
  INSERT INTO visitors (id, fingerprint_id, visit_count, first_seen_at, last_seen_at)
  VALUES (gen_random_uuid(), ${fingerprintId}, 1, now(), now())
  ON CONFLICT (fingerprint_id) DO UPDATE
    SET visit_count = visitors.visit_count + 1,
        last_seen_at = now()
  RETURNING *, (xmax = 0) AS is_new
`;
```

Ini satu-satunya tempat di codebase yang keluar dari Prisma Client API biasa.

---

## Migrations

| Migration | Isi |
|---|---|
| `20260629000000_init` | Semua tabel awal: sites, visitors, visit_logs, fingerprint_components, blocked_ips, admins + extension pgcrypto |
| `20260630000000_add_visitor_summary_view` | CREATE VIEW visitor_summary |
| `20260701000000_add_ua_hints_and_geo` | ALTER TABLE visit_logs (ua_brands, ua_mobile, ua_platform, ua_platform_version, geo_lat, geo_lon, geo_accuracy) + ALTER TABLE fingerprint_components (ua_ch_raw) + UPDATE VIEW visitor_summary |
| `20260701000001_add_timezone_country` | ALTER TABLE visit_logs (timezone) + ALTER TABLE visitors (timezone_country) + UPDATE VIEW visitor_summary (timezoneCountry, lastTimezone) |

Deploy migration ke production: `npx prisma migrate deploy` — dijalankan manual sebelum app restart.

---

## Cache Key Structure (Redis aktif)

- `blocklist:ip:{ip_address}` → JSON `{reason, expires_at}`, TTL = expires_at atau permanen.
- `site:key:{api_key}` → JSON data site, TTL 300 detik.

---

## Testing

**Unit:** `SiteKeyGuard`, `BlocklistService.syncCache`, `IpEnricherService.enrichAndSave`, `RedisCacheService`, `NoopCacheService`.

**e2e:** `POST /v1/sync` full path (guard + upsert + insert log), `GET /v1/blocklist/check/:ip`, blocklist sync saat module init, seluruh suite dengan `REDIS_URL` unset untuk validasi jalur Noop.

---

## Deployment (Production)

- Domain: `relay.fts-tech.co.id` (Cloudflare, Full SSL)
- Server: Plesk Hostinger, Node 25 via nodenv
- Process manager: Passenger (via Plesk)
- Static assets: `sdk/widget.js` disajikan NestJS static middleware di prefix `/static/`
- DB: PostgreSQL (tracker_db), user tracker_username
- Redis: opsional, tidak dipasang di production saat ini

Build + deploy flow:
1. `git push origin main` ke bare repo di server
2. Plesk "Run script" atau SSH manual: `npm run build`
3. `chown -R tracker_username:psacln dist/` (jika build dijalankan sebagai root)
4. `npx prisma migrate deploy` (jika ada migration baru)
5. `touch tmp/restart.txt` (Passenger restart trigger)

---

## Phase 4 (Opsional, belum dikerjakan)

Export CSV visitor, auto-sync blocklist ke Cloudflare Firewall Rules API, notifikasi WhatsApp/Slack saat block baru, dashboard frontend Vue 3, multi-admin CRUD di atas tabel `admins` yang sudah ada.
