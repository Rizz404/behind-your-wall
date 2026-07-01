# Panduan Integrasi behind-your-wall Widget

Dokumen ini menjelaskan cara memasang script tracking `widget.js` ke website yang ingin dimonitor. Ikuti langkah-langkah berikut dari awal sampai akhir.

---

## Daftar Isi

1. [Prasyarat](#1-prasyarat)
2. [Mendaftarkan Site dan Mendapatkan API Key](#2-mendaftarkan-site-dan-mendapatkan-api-key)
3. [Memasang Script di HTML Biasa](#3-memasang-script-di-html-biasa)
4. [Memasang di WordPress](#4-memasang-di-wordpress)
5. [Memasang di Next.js / React](#5-memasang-di-nextjs--react)
6. [Memasang di Laravel Blade](#6-memasang-di-laravel-blade)
7. [Konfigurasi Lanjutan](#7-konfigurasi-lanjutan)
8. [Mendengarkan Event dari Widget](#8-mendengarkan-event-dari-widget)
9. [Kustomisasi Halaman Blocked](#9-kustomisasi-halaman-blocked)
10. [Data yang Dikumpulkan](#10-data-yang-dikumpulkan)
11. [Catatan Geolocation (Izin Browser)](#11-catatan-geolocation-izin-browser)
12. [Verifikasi Integrasi](#12-verifikasi-integrasi)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Prasyarat

Sebelum memasang widget, pastikan:

- Kamu sudah punya **API key** dari server behind-your-wall. API key berbentuk:
  ```
  fts_namadomain_com_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  ```
- Server behind-your-wall sudah berjalan dan bisa diakses publik (contoh: `https://relay.fts-tech.co.id`).
- Website target bisa menjalankan JavaScript (hampir semua website modern).

---

## 2. Mendaftarkan Site dan Mendapatkan API Key

Jika belum punya API key, daftarkan website kamu terlebih dahulu lewat API admin.

### Login sebagai admin

```bash
curl -X POST https://relay.fts-tech.co.id/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "passwordmu"}'
```

Simpan nilai `accessToken` dari response.

### Daftarkan website baru

```bash
curl -X POST https://relay.fts-tech.co.id/v1/sites \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Nama Website Kamu",
    "domain": "namadomain.com"
  }'
```

Response akan berisi `apiKey` — **simpan ini**, tidak akan ditampilkan ulang:

```json
{
  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "name": "Nama Website Kamu",
  "domain": "namadomain.com",
  "apiKey": "fts_namadomain_com_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
  "isActive": true,
  "createdAt": "2026-07-01T00:00:00.000Z"
}
```

---

## 3. Memasang Script di HTML Biasa

Ini adalah metode paling sederhana — cocok untuk website HTML statis atau CMS apa pun yang memperbolehkan pengeditan template.

### Tambahkan tag `<script>` sebelum `</body>`

```html
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Website Saya</title>
</head>
<body>

  <!-- konten website kamu -->

  <!-- Widget tracking — taruh sesaat sebelum </body> -->
  <script
    src="https://relay.fts-tech.co.id/static/widget.js"
    data-site-key="fts_namadomain_com_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
    data-api-base="https://relay.fts-tech.co.id"
  ></script>
</body>
</html>
```

### Atribut yang tersedia

| Atribut | Wajib | Default | Keterangan |
|---|---|---|---|
| `data-site-key` | **Ya** | — | API key yang didapat dari langkah 2 |
| `data-api-base` | Tidak | Origin dari `src` script | URL server API. Isi jika server API berbeda domain dengan file `widget.js` |
| `data-block-redirect` | Tidak | `false` | Set `"true"` agar visitor yang diblokir otomatis di-redirect ke `/blocked`. Tanpa atribut ini, event `tracker:blocked` tetap ditembakin tapi tidak ada redirect |
| `data-geo` | Tidak | `false` | Set `"true"` untuk mengaktifkan pengumpulan koordinat via HTML5 Geolocation API. Tanpa atribut ini, tidak ada dialog izin lokasi yang ditampilkan ke pengunjung |
| `data-geo-trigger` | Tidak | — | CSS selector elemen (contoh: `"#btn-lokasi"`). Jika diisi, dialog izin geolocation baru ditampilkan saat elemen tersebut diklik, bukan saat halaman load. Membutuhkan `data-geo="true"` |

> **Catatan**: Jika `widget.js` dimuat dari `https://relay.fts-tech.co.id/static/widget.js`, maka `data-api-base` otomatis menjadi `https://relay.fts-tech.co.id` — kamu tidak perlu menuliskannya secara eksplisit.

---

## 4. Memasang di WordPress

Ada dua cara untuk WordPress: via `functions.php` (disarankan) atau via plugin.

### Cara A — functions.php (disarankan)

Buka file `functions.php` tema aktif kamu (`wp-content/themes/nama-tema/functions.php`) dan tambahkan kode berikut di bagian bawah:

```php
function byw_enqueue_tracker() {
    // Ganti nilai ini dengan API key milikmu
    $site_key = 'fts_namadomain_com_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
    $api_base = 'https://relay.fts-tech.co.id';

    wp_enqueue_script(
        'byw-widget',
        $api_base . '/static/widget.js',
        array(),
        null,
        true   // load di footer (sebelum </body>)
    );

    // Tambahkan data-site-key dan data-api-base sebagai atribut
    add_filter( 'script_loader_tag', function( $tag, $handle ) use ( $site_key, $api_base ) {
        if ( $handle !== 'byw-widget' ) return $tag;
        $tag = str_replace(
            '<script ',
            '<script data-site-key="' . esc_attr( $site_key ) . '" data-api-base="' . esc_attr( $api_base ) . '" ',
            $tag
        );
        return $tag;
    }, 10, 2 );
}
add_action( 'wp_enqueue_scripts', 'byw_enqueue_tracker' );
```

Simpan file. Script akan otomatis muncul di semua halaman frontend.

### Cara B — Paste langsung di header/footer plugin

Jika menggunakan plugin seperti **Insert Headers and Footers** atau **Header Footer Code Manager**, paste kode ini ke bagian **Footer**:

```html
<script
  src="https://relay.fts-tech.co.id/static/widget.js"
  data-site-key="fts_namadomain_com_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
  data-api-base="https://relay.fts-tech.co.id"
></script>
```

### Memverifikasi di WordPress

1. Buka website WordPress kamu di browser.
2. Klik kanan → **Inspect** (atau tekan F12).
3. Pergi ke tab **Network**, filter dengan kata `widget` atau `sync`.
4. Reload halaman — kamu harus melihat:
   - Request `GET /static/widget.js` → status **200**
   - Request `POST /v1/sync` → status **200**

---

## 5. Memasang di Next.js / React

### Menggunakan `next/script` (Next.js 13+ / App Router)

Buat komponen wrapper dan taruh di layout utama:

```tsx
// components/Tracker.tsx
'use client';

import Script from 'next/script';

export default function Tracker() {
  return (
    <Script
      src="https://relay.fts-tech.co.id/static/widget.js"
      data-site-key="fts_namadomain_com_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
      data-api-base="https://relay.fts-tech.co.id"
      strategy="afterInteractive"
    />
  );
}
```

Tambahkan ke `app/layout.tsx`:

```tsx
// app/layout.tsx
import Tracker from '@/components/Tracker';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        {children}
        <Tracker />
      </body>
    </html>
  );
}
```

### Menggunakan Pages Router (Next.js 12 dan sebelumnya)

```tsx
// pages/_document.tsx
import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="id">
      <Head />
      <body>
        <Main />
        <NextScript />
        <script
          src="https://relay.fts-tech.co.id/static/widget.js"
          data-site-key="fts_namadomain_com_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
          data-api-base="https://relay.fts-tech.co.id"
          async
        />
      </body>
    </Html>
  );
}
```

> **Catatan TypeScript**: Jika TypeScript mengeluh soal `data-site-key` pada elemen `<script>`, tambahkan type declaration:
> ```ts
> declare namespace JSX {
>   interface IntrinsicElements {
>     script: React.DetailedHTMLProps<
>       React.ScriptHTMLAttributes<HTMLScriptElement> & {
>         'data-site-key'?: string;
>         'data-api-base'?: string;
>       },
>       HTMLScriptElement
>     >;
>   }
> }
> ```

### Mendengarkan Event di React

```tsx
'use client';

import { useEffect } from 'react';

export default function TrackerEvents() {
  useEffect(() => {
    const onReady = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      console.log('Visitor tracked:', detail);
    };
    const onBlocked = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      console.warn('Visitor blocked:', detail);
    };

    document.addEventListener('tracker:ready', onReady);
    document.addEventListener('tracker:blocked', onBlocked);

    return () => {
      document.removeEventListener('tracker:ready', onReady);
      document.removeEventListener('tracker:blocked', onBlocked);
    };
  }, []);

  return null;
}
```

---

## 6. Memasang di Laravel Blade

### Tambahkan ke layout utama

Buka file layout Blade kamu (biasanya `resources/views/layouts/app.blade.php`) dan tambahkan sebelum `</body>`:

```blade
{{-- resources/views/layouts/app.blade.php --}}
<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <title>{{ config('app.name') }}</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body>
    @yield('content')

    {{-- Widget tracking --}}
    <script
        src="https://relay.fts-tech.co.id/static/widget.js"
        data-site-key="{{ config('tracker.site_key') }}"
        data-api-base="{{ config('tracker.api_base') }}"
    ></script>
</body>
</html>
```

### Simpan konfigurasi di `.env` Laravel

```env
# .env
TRACKER_SITE_KEY=fts_namadomain_com_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4
TRACKER_API_BASE=https://relay.fts-tech.co.id
```

Buat file config `config/tracker.php`:

```php
<?php

return [
    'site_key' => env('TRACKER_SITE_KEY', ''),
    'api_base' => env('TRACKER_API_BASE', 'https://relay.fts-tech.co.id'),
];
```

Jalankan `php artisan config:cache` setelah mengubah `.env`.

---

## 7. Konfigurasi Lanjutan

### Mengaktifkan redirect ke `/blocked` (opt-in)

Secara default, widget **tidak** melakukan apapun secara visual saat visitor diblokir — hanya event `tracker:blocked` yang ditembakin. Redirect ke `/blocked` hanya terjadi jika kamu secara eksplisit mengaktifkannya lewat `data-block-redirect="true"`:

```html
<!-- Redirect aktif: visitor yang diblokir diarahkan ke /blocked -->
<script
  src="https://relay.fts-tech.co.id/static/widget.js"
  data-site-key="fts_namadomain_com_xxx"
  data-block-redirect="true"
></script>
```

Tanpa atribut itu, website kamu tidak akan merasakan efek apapun ketika ada visitor yang diblokir. Kamu tetap bisa mendengarkan event-nya untuk handling custom (lihat bagian 8).

### Mengaktifkan geolocation (opt-in)

Geolocation tidak aktif secara default. Aktifkan dengan `data-geo="true"`:

```html
<!-- Geolocation aktif: dialog izin muncul saat halaman load -->
<script
  src="https://relay.fts-tech.co.id/static/widget.js"
  data-site-key="fts_namadomain_com_xxx"
  data-geo="true"
></script>
```

### Geolocation via tombol (data-geo-trigger)

Agar dialog izin lokasi muncul hanya saat user mengklik tombol tertentu — bukan saat halaman load:

```html
<!-- Tombol di halaman kamu -->
<button id="btn-cari-toko">Temukan toko terdekat</button>

<!-- Widget: dialog izin lokasi hanya muncul setelah tombol diklik -->
<script
  src="https://relay.fts-tech.co.id/static/widget.js"
  data-site-key="fts_namadomain_com_xxx"
  data-geo="true"
  data-geo-trigger="#btn-cari-toko"
></script>
```

**Perilaku detail `data-geo-trigger`:**
- Jika user **sudah pernah mengizinkan** lokasi di kunjungan sebelumnya → koordinat diambil diam-diam saat halaman load, tanpa dialog, tanpa perlu klik tombol
- Jika user **belum pernah diminta** → tidak ada dialog saat load; saat tombol diklik baru dialog muncul
- Jika user **sudah pernah menolak** → tidak ada dialog muncul sama sekali (browser memblokir)
- Data geo dikirim sebagai request `POST /v1/sync` terpisah setelah klik, tidak mengganggu tracking utama

### Memuat widget secara kondisional

Misalnya hanya track di production, tidak di localhost:

```html
<script>
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    var s = document.createElement('script');
    s.src = 'https://relay.fts-tech.co.id/static/widget.js';
    s.setAttribute('data-site-key', 'fts_namadomain_com_xxx');
    document.body.appendChild(s);
  }
</script>
```

---

## 8. Mendengarkan Event dari Widget

Widget menerbitkan dua custom event di `document`:

### `tracker:ready`

Dipicu setelah tracking berhasil dan pengunjung **tidak** diblokir.

```js
document.addEventListener('tracker:ready', function(e) {
  console.log('Tracking sukses:', e.detail);
  // e.detail: { tracked: true, blocked: false }
});
```

Contoh penggunaan: tampilkan konten premium hanya setelah tracking berhasil, atau kirim analytics tambahan.

### `tracker:blocked`

Dipicu jika IP atau fingerprint pengunjung ada di blocklist. Event ini **selalu ditembakin** — redirect ke `/blocked` hanya terjadi jika `data-block-redirect="true"` dipasang di tag script.

```js
document.addEventListener('tracker:blocked', function(e) {
  console.warn('Visitor diblokir:', e.detail);
  // e.detail: { tracked: false, blocked: true }

  // Contoh: tampilkan pesan tanpa redirect
  document.getElementById('konten-utama').style.display = 'none';
  document.getElementById('pesan-blocked').style.display = 'block';
});
```

Jika kamu menangani event ini sendiri dan juga memasang `data-block-redirect="true"`, set `window.__trackerBlockHandled = true` di dalam handler untuk mencegah redirect default juga terjadi.

---

## 9. Kustomisasi Halaman Blocked

Halaman `/blocked` hanya diperlukan jika kamu mengaktifkan `data-block-redirect="true"`. Visitor yang diblokir diarahkan ke `/blocked` di domain website kamu sendiri (bukan domain tracker).

### HTML biasa

Buat file `blocked.html` di root website:

```html
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Akses Ditolak</title>
  <style>
    body { font-family: sans-serif; text-align: center; padding: 60px 20px; color: #333; }
    h1 { font-size: 2rem; }
    p { color: #666; }
  </style>
</head>
<body>
  <h1>Akses Ditolak</h1>
  <p>Maaf, akses kamu ke website ini telah dibatasi.</p>
</body>
</html>
```

### WordPress

Buat page baru dengan slug `blocked` di wp-admin → Pages → Add New. Slug harus persis `/blocked`.

### Next.js (App Router)

```tsx
// app/blocked/page.tsx
export default function BlockedPage() {
  return (
    <main className="text-center py-24">
      <h1 className="text-4xl font-bold">Akses Ditolak</h1>
      <p className="text-gray-500 mt-4">Maaf, akses kamu ke website ini telah dibatasi.</p>
    </main>
  );
}
```

### Laravel

```php
// routes/web.php
Route::view('/blocked', 'blocked');
```

```blade
{{-- resources/views/blocked.blade.php --}}
@extends('layouts.app')
@section('content')
  <div class="text-center py-24">
    <h1 class="text-4xl font-bold">Akses Ditolak</h1>
    <p class="text-gray-500 mt-4">Maaf, akses kamu ke website ini telah dibatasi.</p>
  </div>
@endsection
```

---

## 10. Data yang Dikumpulkan

Berikut daftar lengkap sinyal yang dikumpulkan widget saat pengunjung membuka halaman:

### FingerprintJS

| Data | Penjelasan |
|---|---|
| `fingerprintId` | ID unik browser/device yang stabil antar session |
| `canvasHash` | Hash dari rendering canvas 2D — sidik jari GPU/driver |
| `webglHash` | Hash dari info WebGL — identifikasi GPU |
| `audioHash` | Hash dari output AudioContext — sidik jari hardware audio |

### User-Agent String (semua browser)

| Data | Penjelasan |
|---|---|
| `userAgent` | String UA lengkap dari `navigator.userAgent` |
| `browser` | Nama browser: Chrome / Firefox / Safari / Edge / Opera |
| `os` | Sistem operasi: Windows / macOS / Android / iOS / Linux |
| `deviceType` | Tipe perangkat: `desktop` / `mobile` / `tablet` |

### User-Agent Client Hints (Chromium 90+ saja)

> Chrome, Edge, Opera. **Firefox dan Safari tidak mendukung API ini** — field-field ini akan kosong untuk pengguna Firefox/Safari.

| Data | Penjelasan |
|---|---|
| `uaBrands` | Array `[{brand, version}]` — daftar browser brand dan versi lengkap |
| `uaMobile` | Boolean, lebih akurat dari deteksi UA string |
| `uaPlatform` | Nama OS aktual tanpa kemungkinan spoofing (`"Windows"`, `"Android"`, dll.) |
| `uaPlatformVersion` | Versi OS — misalnya `"15.0.0"` untuk Windows 11 |
| `uaChRaw` | Raw JSON response `getHighEntropyValues()` (disimpan di tabel fingerprint, bukan per-visit) |

### Browser APIs (semua browser)

| Data | Penjelasan |
|---|---|
| `screenRes` | Resolusi layar, contoh `1920x1080` |
| `language` | Bahasa browser, contoh `id-ID` |
| `timezone` | Timezone, contoh `Asia/Jakarta` |
| `pageUrl` | URL halaman yang sedang dibuka |
| `referrer` | URL halaman sebelumnya (bisa kosong) |

### HTML5 Geolocation API (opt-in, butuh izin user)

> Hanya aktif jika `data-geo="true"` dipasang. Browser menampilkan dialog izin ke pengunjung. Jika ditolak atau timeout 3 detik, field ini kosong dan tracking tetap berjalan normal.

| Data | Penjelasan |
|---|---|
| `geoLat` | Latitude koordinat fisik pengunjung |
| `geoLon` | Longitude koordinat fisik pengunjung |
| `geoAccuracy` | Radius akurasi dalam meter |

### Server-side (tidak dari widget)

| Data | Penjelasan |
|---|---|
| `ip` | IP asli pengunjung (dari header Cloudflare / reverse proxy) |
| `country` | Negara berdasarkan IP, via ip-api.com (async) — tidak akurat jika user pakai VPN |
| `city` | Kota berdasarkan IP |
| `isp` | ISP / provider internet |
| `timezoneCountry` | Negara hasil pemetaan timezone browser → ISO country code — **akurat meski user pakai VPN** |

---

## 11. Catatan Geolocation dan Deteksi Negara

### Geolocation sekarang opt-in

Dialog izin lokasi **tidak akan pernah muncul** kecuali kamu secara eksplisit menambahkan `data-geo="true"` ke tag script. Website yang tidak memasang atribut ini tidak terpengaruh sama sekali.

### Kenapa perlu geolocation kalau ada IP geo?

IP geolocation (ip-api.com) tidak akurat untuk user yang memakai VPN — yang terbaca adalah lokasi server VPN, bukan lokasi asli user. HTML5 Geolocation bekerja di level hardware/OS sehingga VPN tidak mempengaruhinya.

Namun ada alternatif yang **lebih praktis untuk deteksi negara**: timezone browser.

### Timezone → Country (tanpa dialog, tanpa VPN bypass)

Widget selalu mengirimkan timezone browser (`Intl.DateTimeFormat().resolvedOptions().timeZone`, contoh: `"Asia/Jakarta"`). Server memetakan timezone ini ke kode negara ISO dan menyimpannya sebagai `timezoneCountry` di tabel visitors.

- **VPN tidak mempengaruhi timezone** — timezone diatur di level OS, bukan lewat routing internet
- Tidak ada dialog izin apapun — berjalan otomatis tanpa `data-geo`
- Akurasi: sangat tinggi untuk negara (hampir semua user tidak mengubah timezone OS secara manual)
- Tersedia di field `timezoneCountry` pada response `GET /v1/visitors/summary`

### Apa yang terjadi saat dialog geolocation muncul

Jika `data-geo="true"` aktif, browser menampilkan:

> *"[nama-website.com] ingin mengetahui lokasi Anda"* — **Izinkan** | **Tolak**

Dialog ini adalah fitur keamanan browser dan **tidak bisa disembunyikan**. Gunakan `data-geo-trigger` untuk mengontrol kapan dialog muncul (lihat bagian 7).

| Pilihan Pengunjung | Efek pada Tracking |
|---|---|
| **Izinkan** | `geoLat`, `geoLon`, `geoAccuracy` terisi. Tracking tetap berjalan. |
| **Tolak** | Field geo kosong. Tracking tetap berjalan dengan data lain termasuk `timezoneCountry`. |
| **Tidak merespons** (timeout 3 detik) | Field geo kosong. Tracking tetap berjalan. |

### Rekomendasi per use case

| Kebutuhan | Solusi |
|---|---|
| Tahu negara user, termasuk yang pakai VPN | `timezoneCountry` — sudah otomatis, tidak perlu konfigurasi |
| Koordinat presisi (GPS-level) | `data-geo="true"` + opsional `data-geo-trigger` |
| Tidak butuh lokasi sama sekali | Tidak pasang `data-geo` — IP geo tetap berjalan untuk ISP/city |

### Koordinat disimpan di mana?

Di database kamu sendiri (`visit_logs.geo_lat`, `visit_logs.geo_lon`). Tidak dikirim ke pihak ketiga.

---

## 12. Verifikasi Integrasi

Setelah memasang widget, lakukan langkah verifikasi berikut:

### Langkah 1: Cek script termuat

1. Buka website kamu di browser.
2. Tekan **F12** untuk membuka Developer Tools.
3. Pergi ke tab **Network**.
4. Reload halaman.
5. Cari request dengan nama `widget.js` — harus ada response **200 OK**.

### Langkah 2: Cek request sync berhasil

Masih di tab Network, cari request ke `/v1/sync`:

- Status: **200 OK**
- Method: **POST**
- Response body harus: `{"tracked": true, "blocked": false}`

Jika status **401**, berarti `data-site-key` salah atau site sudah dinonaktifkan.

### Langkah 3: Cek data di dashboard

```bash
# Lihat daftar pengunjung terbaru
curl -H "Authorization: Bearer <accessToken>" \
  "https://relay.fts-tech.co.id/v1/visitors/summary?take=5"
```

Visitor dari browser kamu harus muncul di sana.

### Langkah 4: Cek via Console

Di tab Console Developer Tools, tidak boleh ada error bertanda `[tracker.js]`. Pesan sukses tidak ditampilkan secara default — tidak ada pesan = baik.

---

## 13. Troubleshooting

### Script tidak termuat (`widget.js` error 404)

**Penyebab**: URL `src` salah.

**Solusi**: Pastikan URL `src` mengarah ke server yang berjalan. Coba akses langsung di browser:
```
https://relay.fts-tech.co.id/static/widget.js
```
Harus menampilkan kode JavaScript. Jika 404, hubungi admin server.

---

### Request `/v1/sync` mengembalikan 401

**Penyebab**: `data-site-key` tidak valid atau site sudah dinonaktifkan.

**Solusi**:
1. Pastikan nilai `data-site-key` persis sama dengan yang tertera di response saat mendaftar site — tidak ada spasi atau karakter tersembunyi.
2. Cek apakah site masih aktif:
   ```bash
   curl -H "Authorization: Bearer <accessToken>" https://relay.fts-tech.co.id/v1/sites
   ```
   Pastikan `isActive: true` pada site yang dimaksud.

---

### Request `/v1/sync` mengembalikan 403

**Penyebab**: IP pengunjung ada di blocklist.

**Solusi**: Cek apakah IP kamu sendiri terblokir:
```bash
curl https://relay.fts-tech.co.id/v1/blocklist/check/<ip-kamu>
```
Jika terblokir secara tidak sengaja, hapus dari blocklist lewat admin.

---

### CORS error di console

**Penyebab**: Domain website kamu tidak diizinkan memanggil server API.

**Gejala di console**:
```
Access to fetch at 'https://relay.fts-tech.co.id/v1/sync' from origin 'https://website-kamu.com' has been blocked by CORS policy
```

**Solusi**: Hubungi admin server untuk menambahkan domain kamu ke allowed origins, atau pastikan konfigurasi CORS di server sudah mengizinkan wildcard (`*`) atau domain spesifik kamu.

---

### Dialog izin geolocation tidak muncul

**Penyebab**: Browser sudah memblokir izin lokasi secara permanen untuk domain ini.

**Solusi**:
1. Klik ikon gembok / info di address bar browser.
2. Reset izin "Location" menjadi "Ask".
3. Reload halaman.

Ini hanya berpengaruh pada data geo — tracking fingerprint dan UA tetap berjalan.

---

### `fingerprintId` berubah tiap reload

**Penyebab**: Browser dalam mode **Incognito/Private** atau menggunakan ekstensi anti-fingerprint (uBlock, Privacy Badger, dll.) yang merandomisasi canvas/WebGL.

**Efek**: Setiap kunjungan dianggap visitor baru. Ini adalah keterbatasan teknis fingerprinting di browser yang sangat dikonfigurasi — tidak ada solusi sempurna, tapi data IP dan UA tetap tersimpan di `visit_logs`.

---

### Widget tidak jalan di browser lama

FingerprintJS v4 dan dynamic `import()` membutuhkan browser yang mendukung ES Modules. Browser yang **tidak** mendukung:
- Internet Explorer (semua versi)
- Chrome < 63
- Firefox < 67

Untuk browser lama, widget akan gagal diam-diam (tidak ada error yang terlihat user, tapi tidak ada data yang terkirim). Jika target audience kemungkinan memakai browser lama, pertimbangkan untuk menambahkan polyfill atau menggunakan FingerprintJS versi yang lebih lama.

---

*Dokumen ini adalah bagian dari project [behind-your-wall](README.md).*
