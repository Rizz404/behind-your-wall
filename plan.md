# Plan — Fingerprint & IP Tracker (NestJS)

## Context

`unfinished-plan.md` di root project berisi rancangan sistem fingerprint & IP tracker dalam 3 alternatif stack (NestJS, Spring Boot, Go) plus bagian yang sama di ketiganya (schema DB, Redis, API contract, alur data, client SDK, deployment, fase pengerjaan). Sudah diputuskan: **pakai versi NestJS**. Project ini masih kosong (belum ada kode), jadi dokumen ini mengubah rancangan tingkat-tinggi tadi menjadi plan implementasi yang konkret dan bisa langsung dieksekusi — bukan lagi perbandingan 3 stack.

Keputusan yang sudah diambil:
- Admin auth punya tabel `admins` di database sejak Phase 2 (bukan single credential via env var), supaya upgrade ke multi-admin di Phase 4 tidak perlu migrasi tambahan.
- **ORM diganti dari TypeORM ke Prisma.** Prisma tidak punya "LTS" formal (sama seperti Spring Boot/Go di dokumen asli) — kebijakan tim Prisma: tiap major version "production-recommended" didukung ~12 bulan sejak rilis. **Prisma 7** (rilis November 2025, versi stabil terbaru `7.8.0` per pertengahan 2026) adalah pilihan saat ini: query engine baru ditulis full TypeScript (tidak lagi pakai binary Rust), ~3x lebih cepat dan bundle ~90% lebih kecil dibanding era Prisma 5/6. Ini pilihan paling aman untuk project baru sekarang.
- **Redis dijadikan optional**, bukan dependency wajib. App harus tetap berfungsi penuh (validasi site key, cek blocklist) tanpa Redis terpasang — Redis hanya mempercepat, Postgres tetap source of truth di semua skenario.

Output dari plan ini: file `plan.md` ini sendiri di root project.

---

## Tech Stack (Final)

| Komponen | Pilihan | Versi | Keterangan |
| --- | --- | --- | --- |
| Runtime | Node.js | 24 LTS "Krypton" | |
| Framework | NestJS | 11.x (Express v5) | |
| Language | TypeScript | 5.x | |
| ORM | **Prisma** | **7.8.x** | Tidak ada LTS formal, tapi Prisma 7 adalah major "production-recommended" saat ini (rilis Nov 2025, dukungan ~12 bulan). Engine TS murni, tanpa binary Rust. |
| DB | PostgreSQL | 17.x | |
| Redis Client | node-redis | 6.0.0 | **Optional** — hanya dipasang kalau `REDIS_URL` di-set di env. |
| Auth | Passport JWT + bcrypt | 10.x | |
| Validasi | class-validator + class-transformer | 0.14.x + 0.5.x | |
| Rate limiting | @nestjs/throttler | latest | |
| HTTP client (enrichment) | @nestjs/axios | latest | |
| Process manager | pm2 (cluster, 2 instance) | latest | |

Catatan implementasi (koreksi dari asumsi awal): Prisma 7 **mewajibkan driver adapter** untuk koneksi database — `PrismaClient` tidak lagi bisa langsung baca `url` dari `datasource` block di `schema.prisma` (CLI akan menolak field itu). Connection string sekarang dikonfigurasi dua tempat: `prisma.config.ts` (dipakai CLI untuk `migrate`/`generate`) dan lewat `@prisma/adapter-pg` (`PrismaPg`) yang di-pass ke constructor `PrismaClient` saat runtime. Maka tetap perlu install `pg` + `@prisma/adapter-pg`, bukan tidak perlu seperti asumsi awal.

---

## Arsitektur Modul

```
AppModule
├── ConfigModule (global)
├── PrismaModule (global)       — wrapper PrismaClient, OnModuleInit ($connect) / OnModuleDestroy ($disconnect)
├── CacheModule (global)        — abstraksi cache; backing Redis kalau REDIS_URL ada, else No-op
├── AuthModule                  — login admin (tabel `admins`), JWT strategy
├── SitesModule                 — CRUD site + generate API key
├── TrackModule                 — POST /v1/track
├── VisitorsModule              — Visitor/VisitLog/FingerprintComponent + admin endpoints
├── BlocklistModule             — CRUD blocked IP + sync ke cache
├── AnalyticsModule             — summary & chart
└── IpEnricherModule            — panggil ip-api.com, async non-blocking
```

Dua guard inti: `SiteKeyGuard` (header `X-Site-Key`, DB + cache 5 menit) dan `JwtAuthGuard` (Bearer token, endpoint admin). IP asli client dibaca via decorator `@GetIp()`: prioritas `CF-Connecting-IP` → `X-Forwarded-For` → `req.ip`.

### Desain "Redis optional" via `CacheModule`

Daripada menyebar pengecekan `if (redisEnabled)` di setiap service, dibuat satu interface `CacheService` (`get`/`set`/`del`/`isEnabled`) dengan dua implementasi:

- `RedisCacheService` — dipakai kalau `REDIS_URL` ter-set. Wrapper node-redis v6 (lihat lifecycle di bawah).
- `NoopCacheService` — dipakai kalau tidak. `get()` selalu return `null` (selalu "miss"), `set()`/`del()` no-op, `isEnabled()` return `false`.

`CacheModule` adalah dynamic module yang memilih implementasi lewat factory provider berdasarkan `ConfigService.get('REDIS_URL')`. Konsekuensi penting: **logika fallback-ke-DB di `SiteKeyGuard` dan `BlocklistService` yang sudah ada untuk menangani Redis down/error adalah kode yang sama persis dengan logika "Redis tidak dipasang"** — cache miss selalu berarti "tanya DB", baik itu karena Redis benar-benar tidak ada, sedang down, atau memang belum di-cache. Tidak perlu cabang kode tambahan di guard/service manapun.

---

## Struktur Folder

```
prisma.config.ts          # connection string untuk Prisma CLI (migrate/generate) — wajib di Prisma 7
prisma/
├── schema.prisma
└── migrations/                  # di-generate oleh Prisma Migrate

src/
├── main.ts
├── app.module.ts
├── config/
│   ├── configuration.ts
│   └── env.validation.ts
├── prisma/
│   ├── prisma.module.ts
│   └── prisma.service.ts        # extends PrismaClient, OnModuleInit/OnModuleDestroy
├── cache/
│   ├── cache.module.ts          # dynamic module, pilih Redis vs Noop
│   ├── cache.interface.ts       # CacheService contract
│   ├── redis-cache.service.ts
│   └── noop-cache.service.ts
├── common/
│   ├── decorators/get-ip.decorator.ts
│   ├── decorators/current-admin.decorator.ts
│   ├── guards/site-key.guard.ts
│   ├── guards/jwt-auth.guard.ts
│   ├── filters/http-exception.filter.ts
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

sdk/tracker.js          # static file, disajikan langsung oleh nginx
test/                   # e2e specs
ecosystem.config.js     # pm2 cluster config
```

Catatan struktur:
- Tidak ada lagi folder `entities/` per modul — dengan Prisma, semua model didefinisikan satu tempat di `prisma/schema.prisma`, tipe TypeScript di-generate otomatis (`@prisma/client`), service tinggal inject `PrismaService` dan pakai `prisma.visitor.findUnique(...)`, dst.
- `PrismaModule` dan `CacheModule` keduanya `@Global()` agar bisa di-inject di mana saja tanpa import berulang.
- Penamaan kolom: pakai `@map("nama_kolom")` per field dan `@@map("nama_tabel")` per model di `schema.prisma`, supaya properti TS tetap camelCase tapi kolom SQL tetap snake_case sesuai schema dokumen asli.

---

## Database Schema (PostgreSQL 17, via Prisma)

Tabel mengikuti `unfinished-plan.md` **plus tabel `admins`** (dibuat sejak Phase 2):

```prisma
// prisma/schema.prisma — url dipindah ke prisma.config.ts (lihat catatan implementasi di atas)
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

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
  firstSeenAt          DateTime              @default(now()) @map("first_seen_at") @db.Timestamptz(3)
  lastSeenAt           DateTime              @default(now()) @map("last_seen_at") @db.Timestamptz(3)
  visitLogs            VisitLog[]
  fingerprintComponent FingerprintComponent?

  @@map("visitors")
}

model VisitLog {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  visitor    Visitor  @relation(fields: [visitorId], references: [id], onDelete: Cascade)
  visitorId  String   @map("visitor_id") @db.Uuid
  site       Site?    @relation(fields: [siteId], references: [id], onDelete: SetNull)
  siteId     String?  @map("site_id") @db.Uuid
  ip         String   @db.VarChar(45)
  pageUrl    String?  @map("page_url")
  referrer   String?
  userAgent  String?  @map("user_agent")
  browser    String?
  os         String?
  deviceType String?  @map("device_type")
  screenRes  String?  @map("screen_res")
  language   String?
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz(3)

  @@index([visitorId])
  @@index([createdAt])
  @@map("visit_logs")
}

model FingerprintComponent {
  id         String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  visitor    Visitor @relation(fields: [visitorId], references: [id], onDelete: Cascade)
  visitorId  String  @unique @map("visitor_id") @db.Uuid
  canvasHash String? @map("canvas_hash")
  webglHash  String? @map("webgl_hash")
  audioHash  String? @map("audio_hash")
  raw        Json?

  @@map("fingerprint_components")
}

model BlockedIp {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ip        String    @unique @db.VarChar(45)
  reason    String?
  blockedBy String?   @map("blocked_by")
  expiresAt DateTime? @map("expires_at") @db.Timestamptz(3)
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)

  @@map("blocked_ips")
}

model Admin {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  username     String   @unique
  passwordHash String   @map("password_hash")
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(3)

  @@map("admins")
}
```

Semua kolom waktu pakai `@db.Timestamptz(3)` (bukan `timestamp` polos default Prisma) — penting untuk tracker yang mencatat kunjungan dari berbagai timezone client/server.

`gen_random_uuid()` butuh extension `pgcrypto` aktif di database (diaktifkan manual di migration pertama). Index penting sudah tercakup lewat `@unique`/`@@index` di atas: `visitors.fingerprint_id`, `visit_logs.visitor_id`, `visit_logs.created_at`, `blocked_ips.ip`, `admins.username`.

`Admin` di-seed satu baris (bcrypt hash) saat Phase 2; `UsersModule` di Phase 4 tinggal nambah CRUD di atas tabel yang sama, tanpa migrasi baru.

---

## Cache Key Structure (kalau Redis aktif)

- `blocklist:ip:{ip_address}` → JSON `{reason, expires_at}`, TTL = expires_at atau permanen tanpa TTL.
- `site:key:{api_key}` → JSON data site, TTL 300 detik.

Kalau Redis tidak aktif (`NoopCacheService`), key-key ini tidak pernah benar-benar dibuat — setiap pemanggil otomatis jatuh ke query DB langsung.

---

## API Endpoints

Identik dengan `unfinished-plan.md` — `POST /v1/track`, `GET /v1/blocklist/check/:ip`, `POST /v1/auth/login`, `GET /v1/visitors`, `GET /v1/visitors/:fingerprintId`, `GET /v1/sites`, `POST /v1/sites`, `DELETE /v1/sites/:id`, `GET /v1/blocklist`, `POST /v1/blocklist`, `DELETE /v1/blocklist/:ip`, `GET /v1/analytics/overview`.

`GET /v1/blocklist/check/:ip` ("fast check"): baca dari cache kalau aktif, kalau tidak langsung query `blocked_ips` (indexed unique di `ip`, tetap cukup cepat untuk skala project ini — tidak ada regresi fungsional, hanya kehilangan lapisan cache).

---

## Alur Data (POST /v1/track)

1. tracker.js load FingerprintJS v4 di browser → generate `fingerprint_id`.
2. POST ke `/v1/track` dengan header `X-Site-Key` + payload (fingerprint_id, page_url, referrer, UA, screen, language, timezone, raw components).
3. `SiteKeyGuard` validasi: cek cache `site:key:{api_key}` → kalau miss (Redis disabled, down, atau memang belum ke-cache — perlakuannya identik), query DB → kalau cache aktif, cache hasilnya 300s.
4. Cek cache `blocklist:ip:{ip}` — kalau blocked, langsung return `{blocked:true}`. Kalau cache tidak aktif, cek langsung ke `blocked_ips`.
5. Upsert visitor by `fingerprint_id` secara **atomic** (lihat detail di bawah) — kalau baru, trigger IP enrichment async (tidak di-await) + simpan fingerprint_components.
6. Insert baris baru ke `visit_logs`.
7. Return `{tracked:true, blocked:false}`.

### Upsert atomic (race condition pada first-visit bersamaan) — via Prisma raw query

Dua request first-visit dengan `fingerprint_id` sama yang datang hampir bersamaan (double-fire, dua tab) harus tetap menghasilkan satu baris visitor. Prisma `upsert()` standar tidak menjamin atomicity terhadap race ini di semua kondisi, jadi dipakai raw SQL lewat `prisma.$queryRaw` (tagged template, parameter di-escape otomatis oleh Prisma — bukan `$queryRawUnsafe`):

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

Trik `(xmax = 0) AS is_new` memberi tahu apakah baris ini baru di-insert (trigger enrichment) atau sekadar di-update. Ini satu-satunya tempat di codebase yang sengaja keluar dari Prisma Client API biasa — beri komentar jelas di kode kenapa.

### IP enrichment — fire-and-forget, tanpa queue

Volume rendah (sekali per visitor baru, bukan per visit) dan ip-api.com free tier dibatasi 45 req/menit, jadi queue/event-emitter tidak diperlukan — cukup `this.ipEnricherService.enrichAndSave(...).catch(err => logger.warn(...))` tanpa `await`. Timeout 3 detik, fail-open (kalau gagal/timeout, visitor tetap tersimpan tanpa data geo, tidak ada retry).

### Blocklist sync ke cache

`BlocklistService.syncCache()` dipanggil di `OnModuleInit` — otomatis berjalan ulang di setiap restart pm2 cluster worker karena setiap worker adalah proses Nest baru. Kalau cache tidak aktif (`isEnabled() === false`), method ini langsung no-op. `POST/DELETE /v1/blocklist` menulis ke Postgres **dan** langsung ke cache (kalau aktif) di request yang sama; `syncCache()` di startup hanya catch-up untuk perubahan dari luar atau IP yang sudah expired.

---

## node-redis v6 — lifecycle (kalau `RedisCacheService` aktif)

Client dibuat di constructor, `connect()` dipanggil di `onModuleInit()`, `quit()` di `onModuleDestroy()`. Listener `error` harus didaftarkan **sebelum** connect (node-redis v6 bisa crash proses kalau ada error tanpa listener). Tidak ada kode lain yang boleh memanggil `quit()`/`disconnect()` di luar `onModuleDestroy`. Kalau `REDIS_URL` tidak di-set, `CacheModule` tidak pernah membuat instance ini sama sekali — tidak ada percobaan koneksi, tidak ada retry, tidak ada log error soal Redis.

---

## Urutan Pengerjaan — Phase 1 (Fondasi & Tracking, 2-3 hari)

1. Scaffold project Nest, Node 24 engines, `.env.example`, TypeScript strict.
2. `ConfigModule` + validasi env (class-validator) — fail fast kalau `DATABASE_URL`/`JWT_SECRET` kosong. `REDIS_URL` **opsional**, tidak divalidasi sebagai wajib.
3. `npx prisma init`, tulis `schema.prisma` untuk 5 model awal (sites, visitors, visit_logs, fingerprint_components, blocked_ips), `npx prisma migrate dev --name init`.
4. `PrismaModule`/`PrismaService` (`@Global()`, `OnModuleInit` → `$connect()`, `OnModuleDestroy` → `$disconnect()`).
5. `CacheModule` (factory provider: `RedisCacheService` kalau `REDIS_URL` ada, else `NoopCacheService`) — smoke test `PING` kalau Redis aktif.
6. `SitesModule` (create/findAll/deactivate + generate API key `crypto.randomBytes`, prefix `fts_<slug>_<random>`).
7. `SiteKeyGuard` (unit test terpisah dengan mock `SitesService` + `CacheService` — termasuk skenario `isEnabled() === false`).
8. `@GetIp()` decorator.
9. `TrackModule` — DTO, controller, service (upsert atomic via `$queryRaw` + insert visit_logs) — dibangun terakhir karena bergantung pada semua hal di atas.
10. Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) di `main.ts`.
11. `ecosystem.config.js` (pm2 cluster 2 instance, port 3100), setup nginx proxy di Plesk, `sdk/tracker.js` minimal (FingerprintJS v4 + POST ke `/v1/track`) dengan header CORS/cache.
12. Verifikasi end-to-end di `tracker.fts-tech.co.id` pada satu website test — sekali dengan Redis aktif, sekali tanpa (`REDIS_URL` kosong), pastikan keduanya berfungsi identik dari sisi API.

## Phase 2 (Admin API, 2 hari)

- Tambah model `Admin` di `schema.prisma` → `npx prisma migrate dev --name add_admins`, seed satu baris admin dengan bcrypt hash.
- `AuthModule`: `POST /v1/auth/login` (validasi username/password_hash via bcrypt) → JWT. `JwtAuthGuard` + `JwtStrategy` standar Nest/Passport.
- `VisitorsModule` controller: `GET /v1/visitors` (pagination `take`/`skip` + filter country/date-range), `GET /v1/visitors/:fingerprintId` (detail + 50 log terakhir).
- `SitesModule` controller: `GET/POST /v1/sites`, `DELETE /v1/sites/:id`.
- `BlocklistModule` controller: `GET/POST /v1/blocklist`, `DELETE /v1/blocklist/:ip`, `GET /v1/blocklist/check/:ip`.

## Phase 3 (Enrichment & Integrasi, 1-2 hari)

- Finalisasi/hardening `IpEnricherModule` (sudah didesain & sebagian dibangun di Phase 1 lewat `TrackService`).
- Rate limiting `@nestjs/throttler` di `TrackController` (per-IP atau per-site-key), dipasang berdampingan dengan `SiteKeyGuard`.
- `AnalyticsModule.overview()` — aggregate query Prisma (`count()`, `groupBy(['country'])`, bucket 30 hari via raw query `date_trunc('day', created_at)` di `visit_logs` — Prisma belum punya helper native untuk date-bucketing, jadi ini juga lewat `$queryRaw`).
- Contoh middleware Laravel & Next.js (dokumentasi, bukan kode Nest).

## Phase 4 (Opsional, tanpa estimasi)

Export CSV visitor, auto-sync blocklist ke Cloudflare Firewall Rules API, notifikasi WhatsApp/Slack saat block baru, dashboard frontend Vue 3, multi-admin (`UsersModule` CRUD di atas tabel `admins` yang sudah ada dari Phase 2 — tidak perlu migrasi baru).

---

## Migrations (Prisma Migrate)

Schema didefinisikan satu tempat di `prisma/schema.prisma`. Karena implementasi dikerjakan dalam satu sesi (bukan dipisah per hari kalender), keenam model (`Site`, `Visitor`, `VisitLog`, `FingerprintComponent`, `BlockedIp`, `Admin`) digabung jadi **satu migration awal** `prisma/migrations/20260629000000_init/`, bukan dipecah Phase 1 vs Phase 2 seperti rencana semula — secara fungsional tidak ada bedanya (`Admin` tetap tabel yang sama, `UsersModule` Phase 4 tetap tinggal nambah CRUD di atasnya tanpa migrasi baru).

Catatan implementasi: migration SQL ini di-generate dengan `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script` (diff offline, tidak butuh koneksi DB live) lalu ditambahkan manual `CREATE EXTENSION IF NOT EXISTS "pgcrypto";` di baris pertama — environment implementasi ini tidak punya akses ke Postgres milik project (ada instance Postgres lain yang sedang berjalan di mesin yang sama tapi bukan milik project ini, sengaja tidak disentuh). Sebelum dipakai sungguhan: jalankan `npx prisma migrate deploy` melawan `tracker_db` yang sebenarnya, lalu verifikasi `npx prisma migrate status` bersih.

Setiap `migration.sql` di-review manual sebelum commit (cek `@map`/`@@map` ter-translate benar ke snake_case, FK `onDelete` sesuai, tipe `jsonb` untuk `raw`, `timestamptz` bukan `timestamp` polos). Deploy ke production via `npx prisma migrate deploy` — dijalankan manual sebagai langkah deploy terpisah, **bukan** otomatis saat app boot, supaya 2 worker pm2 cluster tidak race menjalankan migration bersamaan saat restart bersamaan.

---

## Testing (proporsional)

**Unit:** `SiteKeyGuard` (matrix: missing header, cache hit aktif/inactive, cache miss→DB, `CacheService.isEnabled() === false`→selalu DB), `BlocklistService.syncCache` (permanent vs expiring vs sudah-expired vs cache disabled→no-op), `IpEnricherService.enrichAndSave` (success/fail/timeout, harus swallow error).

**Integration/e2e:** `POST /v1/track` full path (guard + upsert + insert log) — test paling bernilai di seluruh suite; test konkurensi (2 request bersamaan, fingerprint_id sama → harus jadi 1 visitor dengan visit_count=2, enrichment trigger sekali saja); `GET /v1/blocklist/check/:ip`; blocklist sync saat module init; sekali jalankan seluruh suite e2e dengan `REDIS_URL` di-unset untuk memastikan jalur Noop tidak merusak apa pun.

Tidak perlu: load testing, e2e matrix lengkap untuk semua endpoint admin CRUD (cukup happy-path smoke test, logic-nya simple), contract testing.

---

## Deployment

- Domain `tracker.fts-tech.co.id` (Cloudflare wildcard aktif, Full SSL).
- VPS srv1142454 (Plesk, Hostinger), DB baru `tracker_db` + user `tracker_user`.
- Redis 8.x **opsional** — pasang kalau ingin lapisan cache untuk performa `SiteKeyGuard`/blocklist-check di traffic tinggi; kalau di-pasang, bind `127.0.0.1` saja. Tanpa Redis, app tetap jalan penuh, hanya setiap site-key lookup yang belum di-cache jatuh ke query DB (yang sudah indexed dan murah).
- nginx (Plesk) proxy `tracker.fts-tech.co.id` → `localhost:3100`.
- `sdk/tracker.js` disajikan langsung nginx, header `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=3600`.
- Build: `npm run build` → `npx prisma migrate deploy` → `pm2 start ecosystem.config.js` (cluster, 2 instance).
