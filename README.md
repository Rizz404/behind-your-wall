# behind-your-wall

Fingerprint & IP Tracker API — dibangun dengan NestJS, Prisma, dan PostgreSQL. Sistem ini mencatat pengunjung situs berdasarkan browser fingerprint (FingerprintJS) + IP address, menyimpan riwayat kunjungan, melakukan enrichment geolokasi IP secara async, dan menyediakan blocklist IP serta dashboard analytics sederhana untuk admin.

## Daftar Isi

- [Arsitektur Singkat](#arsitektur-singkat)
- [Prasyarat](#prasyarat)
- [Instalasi & Setup](#instalasi--setup)
- [Menjalankan Aplikasi](#menjalankan-aplikasi)
- [Konfigurasi Environment Variable](#konfigurasi-environment-variable)
- [Membuat Admin Pertama (Seed)](#membuat-admin-pertama-seed)
- [Cara Pakai API](#cara-pakai-api)
  - [1. Login Admin](#1-login-admin)
  - [2. Membuat Site (mendapatkan API Key)](#2-membuat-site-mendapatkan-api-key)
  - [3. Memasang Tracker di Website Target](#3-memasang-tracker-di-website-target)
  - [4. Endpoint Sync (dipanggil otomatis oleh widget.js)](#4-endpoint-sync-dipanggil-otomatis-oleh-widgetjs)
  - [5. Melihat Daftar Pengunjung](#5-melihat-daftar-pengunjung)
  - [6. Analytics Overview](#6-analytics-overview)
  - [7. Blocklist IP](#7-blocklist-ip)
- [Menjalankan Test](#menjalankan-test)
- [Deploy ke Production (PM2)](#deploy-ke-production-pm2)
- [Catatan Teknis](#catatan-teknis)

## Arsitektur Singkat

- **Auth ganda**: `JwtAuthGuard` untuk admin (dashboard), `SiteKeyGuard` untuk request dari website klien (endpoint track).
- **Cache opsional**: Redis jika `REDIS_URL` diisi, otomatis fallback ke no-op cache kalau kosong — Redis bukan dependency wajib.
- **Blocklist**: IP yang diblokir disinkronkan lewat cache agar pengecekan di endpoint track cepat.
- **IP enricher**: lookup geolokasi IP berjalan fire-and-forget (tidak memblok response track).
- **Track**: upsert visitor dilakukan atomik via raw SQL agar tahan race condition saat banyak request bersamaan dari fingerprint yang sama.
- **sdk/widget.js**: script client-side yang ditempel di website target, menjalankan FingerprintJS lalu mengirim data ke endpoint `/v1/sync`.

## Prasyarat

- Node.js >= 24
- PostgreSQL (lokal atau remote)
- Redis (opsional — hanya jika ingin caching site-key)

## Instalasi & Setup

```bash
git clone https://github.com/Rizz404/behind-your-wall.git
cd behind-your-wall
npm install
```

Salin file environment lalu sesuaikan isinya:

```bash
cp .env.example .env
```

Jalankan migration Prisma untuk membuat schema database:

```bash
npm run prisma:migrate:deploy
# atau saat development sambil mengubah schema:
npm run prisma:migrate:dev
```

Generate Prisma Client (otomatis terpanggil oleh `prisma migrate`, tapi bisa dijalankan manual):

```bash
npm run prisma:generate
```

## Menjalankan Aplikasi

```bash
# development dengan watch mode
npm run start:dev

# development biasa
npm run start

# build lalu jalankan hasil build (production-like)
npm run build
npm run start:prod
```

Server akan listen di port yang diset pada `PORT` (default `3100`). Contoh cek server hidup:

```bash
curl http://localhost:3100/v1/blocklist/check/127.0.0.1
```

## Konfigurasi Environment Variable

| Variable | Wajib | Keterangan |
|---|---|---|
| `DATABASE_URL` | Ya | Connection string PostgreSQL |
| `JWT_SECRET` | Ya | Secret untuk sign JWT admin |
| `JWT_EXPIRES_IN` | Tidak | Masa berlaku token, default `8h` |
| `REDIS_URL` | Tidak | Kosongkan untuk jalan tanpa Redis (pakai no-op cache) |
| `SITE_KEY_CACHE_TTL` | Tidak | TTL cache site-key dalam detik, default `300` |
| `PORT` | Tidak | Port HTTP server, default `3100` |
| `IP_ENRICHER_TIMEOUT_MS` | Tidak | Timeout request geolocation IP, default `3000` |
| `SEED_ADMIN_USERNAME` | Saat seed | Username admin yang dibuat oleh `prisma/seed.ts` |
| `SEED_ADMIN_PASSWORD` | Saat seed | Password admin yang dibuat oleh `prisma/seed.ts` |

## Membuat Admin Pertama (Seed)

Endpoint login admin butuh row di tabel `admins`. Buat lewat seed script:

```bash
# pastikan SEED_ADMIN_USERNAME & SEED_ADMIN_PASSWORD sudah diisi di .env
npm run prisma:seed
```

Script ini melakukan upsert — aman dijalankan ulang untuk reset password admin yang sama.

## Cara Pakai API

Semua endpoint berprefix `v1`. Body request berformat JSON, divalidasi strict (`whitelist: true, forbidNonWhitelisted: true`) jadi field di luar DTO akan ditolak.

### 1. Login Admin

```bash
curl -X POST http://localhost:3100/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "your-password"}'
```

Response:

```json
{ "accessToken": "eyJhbGciOi..." }
```

Pakai token ini sebagai `Authorization: Bearer <accessToken>` untuk semua endpoint admin (`/v1/sites`, `/v1/visitors`, `/v1/analytics`, `/v1/blocklist` selain `check/:ip`).

### 2. Membuat Site (mendapatkan API Key)

Setiap website yang ingin ditrack harus didaftarkan sebagai "site" untuk mendapatkan API key (`X-Site-Key`).

```bash
curl -X POST http://localhost:3100/v1/sites \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Toko Online Saya", "domain": "tokoku.com"}'
```

Response berisi `apiKey` berformat `fts_<domain-slug>_<random hex>`. Simpan ini untuk dipasang di widget.js.

Endpoint lain:

```bash
# list semua site
curl -H "Authorization: Bearer <accessToken>" http://localhost:3100/v1/sites

# nonaktifkan site (isActive = false, API key langsung ditolak)
curl -X DELETE -H "Authorization: Bearer <accessToken>" http://localhost:3100/v1/sites/<siteId>
```

### 3. Memasang Tracker di Website Target

Tempel `sdk/widget.js` (host file ini di mana saja yang bisa diakses publik, misal dari server API ini sendiri atau CDN) ke halaman HTML website yang ingin ditrack:

```html
<script
  src="https://api.kamu.com/static/widget.js"
  data-site-key="fts_tokoku_com_xxxxxxxxxxxxxxxx"
  data-api-base="https://api.kamu.com"
></script>
```

- `data-site-key` **wajib** — API key dari langkah 2.
- `data-api-base` opsional — default mengambil origin dari `src` script itu sendiri.

Saat halaman dimuat, script ini otomatis:
1. Memuat library FingerprintJS dari CDN.
2. Menghasilkan `visitorId` (fingerprint) dan raw components (canvas, webgl, audio hash, dll).
3. Mengirim `POST /v1/sync` dengan header `X-Site-Key`.
4. Jika IP/fingerprint pengunjung diblokir, otomatis redirect ke `/blocked` (bisa di-custom dengan listen event `tracker:blocked` di `document`).

Event yang bisa didengarkan di halaman target:

```js
document.addEventListener('tracker:ready', (e) => console.log('tracked', e.detail));
document.addEventListener('tracker:blocked', (e) => console.log('blocked', e.detail));
```

### 4. Endpoint Sync (dipanggil otomatis oleh widget.js)

Biasanya tidak dipanggil manual, tapi untuk testing:

```bash
curl -X POST http://localhost:3100/v1/sync \
  -H "Content-Type: application/json" \
  -H "X-Site-Key: fts_tokoku_com_xxxxxxxxxxxxxxxx" \
  -d '{
    "fingerprintId": "abc123",
    "pageUrl": "https://tokoku.com/produk/1",
    "userAgent": "Mozilla/5.0 ...",
    "screenRes": "1920x1080",
    "language": "id-ID",
    "timezone": "Asia/Jakarta"
  }'
```

Response:

```json
{ "tracked": true, "blocked": false }
```

Catatan:
- Endpoint ini di-rate-limit: maksimal 30 request/menit per IP (`ThrottlerGuard`).
- Jika IP pengunjung ada di blocklist, response jadi `{ "tracked": false, "blocked": true }` dan tidak ada data yang disimpan.
- Field `fingerprintId` wajib; field lain opsional.

### 5. Melihat Daftar Pengunjung

```bash
# list dengan pagination & filter
curl -H "Authorization: Bearer <accessToken>" \
  "http://localhost:3100/v1/visitors?skip=0&take=25&country=ID&from=2026-06-01&to=2026-06-30"

# detail satu visitor by fingerprintId
curl -H "Authorization: Bearer <accessToken>" \
  http://localhost:3100/v1/visitors/abc123
```

Query parameter `ListVisitorsQueryDto`:

| Param | Default | Keterangan |
|---|---|---|
| `skip` | `0` | Offset pagination |
| `take` | `25` | Limit per page (max 100) |
| `country` | - | Filter berdasar kode negara hasil enrichment |
| `from` / `to` | - | Filter rentang tanggal (ISO date string) |

### 6. Analytics Overview

```bash
curl -H "Authorization: Bearer <accessToken>" http://localhost:3100/v1/analytics/overview
```

Response:

```json
{
  "totalVisitors": 1234,
  "totalVisits": 5678,
  "topCountries": [{ "country": "ID", "count": 900 }],
  "last30Days": [{ "day": "2026-06-01T00:00:00.000Z", "count": 42 }]
}
```

### 7. Blocklist IP

```bash
# cek apakah IP diblokir (public, dipakai endpoint track sendiri)
curl http://localhost:3100/v1/blocklist/check/1.2.3.4

# list semua IP yang diblokir (admin only)
curl -H "Authorization: Bearer <accessToken>" http://localhost:3100/v1/blocklist

# blokir IP baru (admin only)
curl -X POST http://localhost:3100/v1/blocklist \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"ip": "1.2.3.4", "reason": "spam bot", "expiresAt": "2026-12-31T00:00:00.000Z"}'

# hapus IP dari blocklist (admin only)
curl -X DELETE -H "Authorization: Bearer <accessToken>" http://localhost:3100/v1/blocklist/1.2.3.4
```

`expiresAt` opsional — jika tidak diisi, blokir berlaku permanen sampai dihapus manual.

## Menjalankan Test

```bash
npm run test          # unit test
npm run test:cov      # unit test + coverage
npm run test:e2e      # e2e test (butuh DB yang sudah dimigrasikan)
```

## Deploy ke Production (PM2)

```bash
npm run build
pm2 start ecosystem.config.js
```

`ecosystem.config.js` menjalankan `dist/main.js` dalam cluster mode 2 instance. Pastikan `.env` (atau env var di level OS/PM2) sudah lengkap sebelum start, dan migration sudah dijalankan (`npm run prisma:migrate:deploy`) di database production.

## Catatan Teknis

- Lihat [plan.md](plan.md) untuk dokumen desain arsitektur lengkap (schema database, keputusan teknis, dan alasan di baliknya).
- Upsert visitor pada `track.service.ts` memakai raw SQL (`INSERT ... ON CONFLICT`) secara sengaja agar atomik di bawah concurrency tinggi — Prisma `upsert()` biasa tidak menjamin ini.
- Redis benar-benar opsional: kosongkan `REDIS_URL` untuk menjalankan seluruh sistem tanpa Redis sama sekali (cache otomatis fallback ke no-op).
