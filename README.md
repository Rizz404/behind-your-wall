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
- [Sinyal yang Dikumpulkan widget.js](#sinyal-yang-dikumpulkan-widgetjs)
- [Menjalankan Test](#menjalankan-test)
- [Deploy ke Production (Plesk + Passenger)](#deploy-ke-production-plesk--passenger)
- [Catatan Teknis](#catatan-teknis)

## Arsitektur Singkat

- **Auth ganda**: `JwtAuthGuard` untuk admin (dashboard), `SiteKeyGuard` untuk request dari website klien (endpoint sync).
- **Cache opsional**: Redis jika `REDIS_URL` diisi, otomatis fallback ke no-op cache kalau kosong — Redis bukan dependency wajib.
- **Blocklist**: IP yang diblokir disinkronkan lewat cache agar pengecekan di endpoint sync cepat.
- **IP enricher**: lookup geolokasi IP berjalan fire-and-forget (tidak memblok response sync).
- **Sync**: upsert visitor dilakukan atomik via raw SQL agar tahan race condition saat banyak request bersamaan dari fingerprint yang sama.
- **sdk/widget.js**: script client-side yang ditempel di website target. Mengumpulkan FingerprintJS + UA-CH + timezone, dan opsional HTML5 Geolocation, lalu mengirim semua data ke endpoint `/v1/sync`. Fitur blocked-redirect dan geolocation bersifat opt-in lewat atribut `data-*`.
- **visitor_summary**: PostgreSQL view yang menggabungkan data visitor, geo, dan visit log terakhir — endpoint `/v1/visitors/summary` memakainya untuk listing efisien.

## Prasyarat

- Node.js >= 25 (production menggunakan Node 25 via nodenv)
- PostgreSQL (lokal atau remote)
- Redis (opsional — hanya jika ingin caching site-key dan blocklist)

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

Tempel tag `<script>` berikut ke halaman HTML website yang ingin ditrack:

```html
<script
  src="https://relay.fts-tech.co.id/static/widget.js"
  data-site-key="fts_tokoku_com_xxxxxxxxxxxxxxxx"
  data-api-base="https://relay.fts-tech.co.id"
></script>
```

- `data-site-key` **wajib** — API key dari langkah 2.
- `data-api-base` opsional — default mengambil origin dari `src` script itu sendiri.

Saat halaman dimuat, script ini otomatis:
1. Memuat library FingerprintJS dari CDN.
2. **Paralel**: meminta User-Agent Client Hints (high-entropy) dan HTML5 Geolocation.
3. Menghasilkan `visitorId` (fingerprint) dan raw components (canvas, webgl, audio hash, dll).
4. Mengirim `POST /v1/sync` dengan semua data yang terkumpul.
5. Jika IP/fingerprint pengunjung diblokir, otomatis redirect ke `/blocked`.

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
    "timezone": "Asia/Jakarta",
    "uaMobile": false,
    "uaPlatform": "Windows",
    "uaPlatformVersion": "15.0.0",
    "uaBrands": [{"brand": "Chromium", "version": "136"}, {"brand": "Google Chrome", "version": "136"}],
    "geoLat": -6.2088,
    "geoLon": 106.8456,
    "geoAccuracy": 15.0
  }'
```

Response:

```json
{ "tracked": true, "blocked": false }
```

Catatan:
- Endpoint ini di-rate-limit: maksimal 30 request/menit per IP (`ThrottlerGuard`).
- Jika IP pengunjung ada di blocklist, response jadi `{ "tracked": false, "blocked": true }` dan tidak ada data yang disimpan.
- Field `fingerprintId` wajib; semua field lain opsional.
- `geoLat`/`geoLon` hanya terisi jika pengunjung mengizinkan akses lokasi di browser.

### 5. Melihat Daftar Pengunjung

```bash
# list ringkasan via visitor_summary view (lebih efisien, satu query)
curl -H "Authorization: Bearer <accessToken>" \
  "http://localhost:3100/v1/visitors/summary?skip=0&take=25&country=ID"

# list visitor biasa dengan pagination & filter
curl -H "Authorization: Bearer <accessToken>" \
  "http://localhost:3100/v1/visitors?skip=0&take=25&country=ID&from=2026-06-01&to=2026-06-30"

# detail satu visitor by fingerprintId (termasuk 50 visit log terakhir)
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
# cek apakah IP diblokir (public, dipakai endpoint sync sendiri)
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

## Sinyal yang Dikumpulkan widget.js

| Kategori | Field | Sumber | Keterangan |
|---|---|---|---|
| Fingerprint | `fingerprintId` | FingerprintJS v4 | Stable visitor ID |
| Fingerprint | `canvasHash`, `webglHash`, `audioHash` | FingerprintJS v4 | Hash komponen hardware |
| Fingerprint | `rawComponents` | FingerprintJS v4 | Raw signal components |
| UA String | `userAgent` | `navigator.userAgent` | String UA klasik |
| UA String | `browser`, `os`, `deviceType` | Parsed dari UA string | Deteksi sisi widget |
| UA Client Hints | `uaBrands` | `userAgentData.fullVersionList` | Brand + versi Chromium, fallback ke `brands` |
| UA Client Hints | `uaMobile` | `userAgentData.mobile` | Boolean mobile/desktop |
| UA Client Hints | `uaPlatform` | `userAgentData.platform` | OS platform (akurat, bukan dari UA string) |
| UA Client Hints | `uaPlatformVersion` | `userAgentData.getHighEntropyValues()` | Versi OS (misal "15.0.0" untuk Windows 11) |
| UA Client Hints | `uaChRaw` | `getHighEntropyValues()` | Raw response lengkap UA-CH |
| Browser | `screenRes` | `window.screen` | Resolusi layar |
| Browser | `language` | `navigator.language` | Bahasa browser |
| Browser | `timezone` | `Intl.DateTimeFormat()` | Timezone browser |
| Browser | `pageUrl`, `referrer` | `window.location`, `document.referrer` | URL halaman dan referrer |
| Geolocation | `geoLat`, `geoLon` | HTML5 Geolocation API | Koordinat fisik (opt-in via `data-geo="true"`, jika user izinkan) |
| Geolocation | `geoAccuracy` | HTML5 Geolocation API | Akurasi dalam meter |
| IP (server-side) | `ip` | Header CF-Connecting-IP / X-Forwarded-For | IP asli client |
| IP Enrichment | `country`, `city`, `isp` | ip-api.com (async) | Geolokasi berbasis IP — tidak akurat jika user pakai VPN |
| Timezone Mapping | `timezoneCountry` | IANA timezone → ISO country code (server-side) | Negara akurat meski user pakai VPN |

**Catatan UA Client Hints**: API ini hanya tersedia di browser berbasis Chromium (Chrome 90+, Edge 90+). Firefox dan Safari tidak mengimplementasikannya — untuk browser tersebut, widget otomatis fallback ke parsing UA string biasa.

**Catatan HTML5 Geolocation**: Fitur ini **opt-in** — tidak aktif kecuali `data-geo="true"` ditambahkan ke tag script. Jika aktif, browser meminta izin ke pengguna; jika ditolak atau timeout 3 detik, field geo kosong dan tracking tetap berjalan. Gunakan `data-geo-trigger="#selector"` agar dialog hanya muncul saat user mengklik elemen tertentu.

**Catatan Timezone Country**: `timezoneCountry` dipetakan server-side dari timezone browser menggunakan IANA timezone database. Karena VPN tidak mengubah timezone OS, field ini akurat bahkan untuk user yang menyembunyikan IP aslinya. Tidak memerlukan izin apapun dari user.

## Menjalankan Test

```bash
npm run test          # unit test
npm run test:cov      # unit test + coverage
npm run test:e2e      # e2e test (butuh DB yang sudah dimigrasikan)
```

## Deploy ke Production (Plesk + Passenger)

Production berjalan di `relay.fts-tech.co.id` (Plesk Hostinger, Node 25 via nodenv, Passenger).

```bash
# 1. Push ke bare git repo di server
git push origin main

# 2. Di Plesk: Git → Run script (npm run build)
#    Atau via SSH:
ssh root@<server-ip>
cd /var/www/vhosts/.../behind-your-wall
/opt/plesk/node/25/bin/npm run build
chown -R tracker_username:psacln dist/

# 3. Jalankan migration (sekali, sebelum restart)
/opt/plesk/node/25/bin/npx prisma migrate deploy

# 4. Restart app (Passenger)
touch tmp/restart.txt
```

Catatan deployment:
- `dist/` harus dimiliki oleh `tracker_username:psacln` — jika build dijalankan sebagai root, jalankan `chown -R tracker_username:psacln dist/` setelahnya.
- Migration dijalankan **manual** terpisah, bukan otomatis saat app boot, agar 2 worker Passenger tidak race.
- `sdk/widget.js` disajikan langsung via static middleware NestJS di prefix `/static/`.

## Catatan Teknis

- Lihat [plan.md](plan.md) untuk dokumen desain arsitektur lengkap (schema database, keputusan teknis, dan alasan di baliknya).
- Upsert visitor pada `track.service.ts` memakai raw SQL (`INSERT ... ON CONFLICT`) secara sengaja agar atomik di bawah concurrency tinggi — Prisma `upsert()` biasa tidak menjamin ini.
- Redis benar-benar opsional: kosongkan `REDIS_URL` untuk menjalankan seluruh sistem tanpa Redis sama sekali (cache otomatis fallback ke no-op).
- UA Client Hints dikumpulkan paralel dengan FingerprintJS loading — tidak menambah latency. HTML5 Geolocation opt-in via `data-geo="true"`; jika `data-geo-trigger` diset, dialog hanya muncul saat user klik elemen tersebut.
- `timezoneCountry` dipetakan server-side dari timezone browser (IANA → ISO country code) — tidak terpengaruh VPN, tidak butuh izin user.
