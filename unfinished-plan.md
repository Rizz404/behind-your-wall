# Rencana Sistem — Fingerprint & IP Tracker
## Tiga Versi: NestJS · Spring Boot · Go

> Dokumen ini adalah **rencana dan desain sistem**, bukan implementasi.
> Tiga versi dipresentasikan agar bisa dibandingkan dan dipilih sesuai kebutuhan tim.

---

## Catatan Penting tentang "LTS" di Tiap Ekosistem

Sebelum masuk ke stack masing-masing, penting untuk jujur soal LTS karena tiap ekosistem mendefinisikannya berbeda:

**Node.js** — punya LTS formal. Versi genap masuk Active LTS setelah 6 bulan, didukung 30 bulan. Node.js 24 adalah Active LTS saat ini (EOL April 2028).

**Java** — punya LTS formal. Rilis setiap 2 tahun, didukung bertahun-tahun. Java 21 dan Java 25 adalah LTS aktif. Eclipse Temurin / Amazon Corretto memberikan dukungan gratis jauh lebih lama dari Oracle JDK.

**Spring Boot** — **tidak punya LTS** dalam pengertian tradisional. Setiap minor version (4.0, 4.1, dst) didukung OSS selama 12 bulan saja. Untuk produksi, pakai versi stabil terbaru dan upgrade setiap tahun. VMware Tanzu menyediakan extended support berbayar.

**Go** — **tidak punya LTS**. Kebijakan resminya: dua versi major terbaru selalu didukung. Saat ini Go 1.26 dan 1.25. Ketika Go 1.27 rilis (sekitar Agustus 2026), Go 1.25 akan EOL. Rekomendasi: selalu pakai versi terbaru.

---

## Versi 1 — NestJS (Node.js)

### Tech Stack

| Komponen        | Pilihan                             | Versi                | Keterangan                                                                                                                 |
| --------------- | ----------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Runtime         | Node.js                             | **24 LTS "Krypton"** | Active LTS, EOL April 2028. Node.js 20 sudah EOL April 2026.                                                               |
| Framework       | NestJS                              | **11.x** (11.1.27)   | Stable terbaru. v12 masih alpha, target Q3 2026. Pakai Express v5 secara default.                                          |
| Language        | TypeScript                          | 5.x                  | Built-in di NestJS.                                                                                                        |
| ORM             | TypeORM                             | **1.0.0**            | Major release baru Mei 2026. Hapus `Connection` yang deprecated, support ES2023+.                                          |
| DB Client       | pg (node-postgres)                  | 8.x                  | Driver PostgreSQL untuk Node.js.                                                                                           |
| Redis Client    | **node-redis**                      | **6.0.0**            | ioredis sendiri merekomendasikan `node-redis` untuk project baru. node-redis v6 support Redis 7/8 dan client-side caching. |
| Auth            | Passport JWT                        | 10.x                 | Standard auth di ekosistem NestJS.                                                                                         |
| Validasi        | class-validator + class-transformer | 0.14.x + 0.5.x       | Pair klasik untuk validasi DTO di NestJS.                                                                                  |
| Migrasi DB      | TypeORM Migrations                  | (built-in)           | Bagian dari TypeORM 1.0.0.                                                                                                 |
| Build Tool      | npm / pnpm                          | —                    | pnpm lebih efisien untuk monorepo.                                                                                         |
| Process Manager | pm2                                 | latest               | Standard untuk Node.js di VPS.                                                                                             |

### Pendekatan Arsitektur NestJS

NestJS menggunakan pola Angular-style: seluruh sistem dibagi menjadi **Module**, tiap modul punya Controller, Service, dan Repository. Dependency injection dilakukan oleh NestJS IoC container secara otomatis.

**Struktur modul yang akan dibuat:**
- `AuthModule` — login admin, JWT strategy
- `SitesModule` — manajemen website terdaftar + generate API key
- `TrackModule` — endpoint utama POST /v1/track
- `VisitorsModule` — admin endpoint untuk lihat dan filter visitor
- `BlocklistModule` — CRUD IP blocked + sync Redis
- `AnalyticsModule` — endpoint summary dan chart data
- `RedisModule` — wrapper global untuk node-redis client
- `IpEnricherModule` — service pemanggil ip-api.com

**Cara kerja Guard di NestJS:**
Dua guard yang paling penting: `SiteKeyGuard` mengecek header `X-Site-Key` dan melakukan validasi ke database (dengan Redis cache 5 menit), dan `JwtAuthGuard` memvalidasi Bearer token untuk endpoint admin. Guard adalah kelas yang di-inject ke controller, sehingga logika auth terpisah dari logika bisnis.

**Cara kerja validasi:**
DTO (Data Transfer Object) menggunakan decorator dari `class-validator`. NestJS `ValidationPipe` secara otomatis memvalidasi setiap request body sebelum masuk ke handler. Jika invalid, otomatis lempar `400 Bad Request` tanpa satu baris kode validasi manual.

**Cara kerja TypeORM 1.0.0:**
Entity didefinisikan sebagai class TypeScript dengan decorator `@Entity`, `@Column`, `@ManyToOne`, dst. Perubahan schema menggunakan migration files yang di-generate dan dijalankan via CLI. `synchronize: false` wajib di production — jangan pernah biarkan TypeORM otomatis sync schema di production.

**Catatan spesifik NestJS:**
- `CF-Connecting-IP` header dari Cloudflare harus dibaca sebagai IP asli user — buat custom decorator `@GetIp()` yang prioritaskan header ini.
- node-redis v6 memerlukan async initialization via `client.connect()` — bungkus dalam NestJS service yang mengimplementasikan `OnModuleInit` dan `OnModuleDestroy`.
- pm2 cluster mode (2 instance) untuk manfaatkan multi-core CPU, tapi harus perhatikan bahwa Redis blocklist sync harus dilakukan setiap instance restart — ini sudah ter-cover karena `BlocklistService.syncToRedis()` dipanggil di `OnModuleInit`.

---

## Versi 2 — Spring Boot (Java)

### Tech Stack

| Komponen              | Pilihan                                       | Versi                            | Keterangan                                                                                                                                                                                    |
| --------------------- | --------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime               | Java (Eclipse Temurin)                        | **21 LTS**                       | LTS formal. EOL Eclipse Temurin September 2028. Atau Java 25 LTS (rilis September 2025) jika ingin fitur terbaru. Hindari Oracle JDK — free window-nya untuk Java 21 berakhir September 2026. |
| Framework             | Spring Boot                                   | **4.1.0**                        | Stable terbaru Juni 2026. Berbasis Spring Framework 7. Minimum Java 17. Tidak ada "LTS" — update ke minor version baru setiap ~6 bulan.                                                       |
| ORM                   | Spring Data JPA (Hibernate)                   | Hibernate **7.x**                | Built-in di Spring Boot 4. Mature, production-tested.                                                                                                                                         |
| DB Connection Pool    | HikariCP                                      | (built-in)                       | Sudah bundled di Spring Boot, tidak perlu tambahan konfigurasi. Paling performa untuk PostgreSQL.                                                                                             |
| Redis Client          | Spring Data Redis (Lettuce)                   | (built-in)                       | Lettuce adalah default reactive Redis client di Spring. Non-blocking.                                                                                                                         |
| Auth                  | Spring Security + JJWT                        | Spring Security 7.x, JJWT 0.12.x | Spring Security untuk filter chain, JJWT untuk generate/validate JWT token.                                                                                                                   |
| Validasi              | Jakarta Bean Validation (Hibernate Validator) | (built-in)                       | Standard Java validation dengan `@Valid`, `@NotBlank`, `@Email`, dst.                                                                                                                         |
| Migrasi DB            | **Flyway**                                    | 10.x                             | Paling matang untuk Java/Spring ecosystem. SQL-based, version-controlled, rollback-aware. Lebih robust dari TypeORM/golang-migrate.                                                           |
| Boilerplate Reduction | Lombok                                        | 1.18.x                           | `@Getter`, `@Setter`, `@Builder`, `@RequiredArgsConstructor` — eliminasi boilerplate Java.                                                                                                    |
| HTTP Client           | Spring WebClient atau RestClient              | (built-in Spring 6)              | `RestClient` adalah API baru di Spring 6 untuk synchronous HTTP. Pakai untuk panggil ip-api.com.                                                                                              |
| Build Tool            | Maven atau Gradle                             | Maven 3.9.x / Gradle 8.x         | Maven lebih umum di Spring Boot ecosystem. Gradle lebih fleksibel.                                                                                                                            |
| Deployment            | Docker + JVM / GraalVM Native                 | —                                | Bisa deploy sebagai JAR biasa atau native image dengan GraalVM untuk startup lebih cepat.                                                                                                     |

**Pilihan Java 21 vs Java 25:**
Keduanya adalah LTS. Java 21 adalah pilihan paling aman saat ini — semua library dan framework sudah stabil dengan Java 21. Java 25 (rilis September 2025) sudah didukung Spring Boot 4.x, dan menawarkan structured concurrency yang mature. Untuk project baru di 2026, Java 21 adalah *safe choice*, Java 25 adalah *cutting-edge choice*.

### Pendekatan Arsitektur Spring Boot

Spring Boot menggunakan pola MVC tradisional dengan DI berbasis annotation. Tidak ada "module" eksplisit seperti NestJS — Spring scan seluruh classpath dan auto-configure berdasarkan dependency yang ada di classpath.

**Layer arsitektur:**
- `@RestController` — menerima HTTP request, return response (tidak ada logika bisnis)
- `@Service` — logika bisnis
- `@Repository` — akses database via Spring Data JPA
- `@Entity` — representasi tabel database sebagai Java class
- DTO — plain Java class (dengan Lombok `@Data` atau Java records)
- `@Configuration` + `@Bean` — konfigurasi manual untuk komponen yang tidak bisa di-auto-configure

**Security dengan Spring Security:**
Spring Security bekerja sebagai filter chain. Setiap request melewati chain filter sebelum sampai ke controller. Untuk auth JWT, diperlukan custom filter (`JwtAuthenticationFilter`) yang membaca Bearer token dari header, validasi, dan set `SecurityContext`. Endpoint yang butuh JWT di-protect lewat `SecurityFilterChain` configuration.

Untuk Site API Key (`X-Site-Key`), dibuat custom filter terpisah yang diaktifkan hanya untuk endpoint `/v1/track`. Pattern ini lebih bersih dari NestJS karena filter Spring lebih dekat ke level servlet — tidak ada overhead DI resolution per request.

**Flyway vs TypeORM Migrations:**
Flyway menggunakan file SQL bernomor (`V1__Create_initial_schema.sql`, `V2__Add_blocklist_index.sql`) yang disimpan di `resources/db/migration/`. Flyway otomatis menjalankan migration yang belum dijalankan saat application startup. Pendekatan ini lebih *predictable* — kamu menulis SQL persis yang akan dieksekusi ke database, bukan SQL yang di-generate ORM.

**Virtual Threads (Java 21+):**
Spring Boot 4.x mendukung virtual threads dari Project Loom. Dengan `spring.threads.virtual.enabled=true`, Spring akan menjalankan setiap HTTP request di virtual thread, bukan OS thread. Ini meningkatkan throughput secara signifikan untuk I/O-bound workload seperti tracker ini (banyak database calls, Redis calls) tanpa perlu reactive programming.

**Catatan spesifik Spring Boot:**
- HikariCP connection pool: konfigurasi `maximum-pool-size` dengan benar. Default 10 terlalu kecil untuk high-traffic endpoint.
- Spring Data Redis: konfigurasi `RedisTemplate<String, String>` dengan `StringRedisSerializer` untuk menghindari issue serialisasi default.
- IP Enrichment: gunakan `RestClient` dengan timeout yang proper. Jangan panggil ip-api.com di main thread — gunakan `CompletableFuture.runAsync()` atau `@Async` agar tidak block response ke client.
- Flyway naming convention: `V{version}__{description}.sql`. Double underscore sebelum description.
- Deployment: Spring Boot menghasilkan fat JAR (`java -jar tracker.jar`). Lebih mudah dijalankan di Plesk via `nohup java -jar tracker.jar &` atau systemd service.

---

## Versi 3 — Go

### Tech Stack

| Komponen      | Pilihan                 | Versi                    | Keterangan                                                                                                                                                                              |
| ------------- | ----------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime       | Go                      | **1.26.4**               | Tidak ada LTS formal. Policy: dua versi terbaru selalu didukung. Go 1.26 rilis Februari 2026, patch terbaru 1.26.4 (Juni 2026). Green Tea GC sekarang default — performa GC lebih baik. |
| Web Framework | **Gin**                 | 1.10.x                   | Paling populer dan battle-tested. Aktif dirawat. Middleware ecosystem besar. Alternatif: Echo v4 (lebih opinionated), Chi (paling ringan, closest to stdlib).                           |
| ORM           | **GORM**                | v2                       | Paling populer di Go. Support PostgreSQL, auto-migration, hooks, associations. Lebih verbose dari Hibernate tapi eksplisit.                                                             |
| DB Driver     | pgx (via GORM adapter)  | v5                       | pgx adalah driver PostgreSQL terbaik untuk Go — lebih performa dari lib/pq yang lama.                                                                                                   |
| Redis Client  | **go-redis**            | v9                       | Official Redis client yang direkomendasikan oleh Redis team. Support Redis 7/8, pipeline, cluster.                                                                                      |
| JWT           | golang-jwt/jwt          | v5                       | Library JWT paling banyak dipakai di Go. Aktif dirawat.                                                                                                                                 |
| Konfigurasi   | **viper**               | v1.x                     | Paling fleksibel — support .env, YAML, flags, environment variables.                                                                                                                    |
| Migrasi DB    | **golang-migrate**      | v4                       | SQL-based migrations untuk Go. Tidak tied ke ORM tertentu. Support PostgreSQL, bisa dijalankan via CLI atau embedded di aplikasi.                                                       |
| Validasi      | go-playground/validator | v10                      | Validator via struct tags. Paling umum di Go ecosystem.                                                                                                                                 |
| Logging       | **log/slog**            | (built-in sejak Go 1.21) | Structured logging resmi dari standard library. Tidak perlu zap atau logrus lagi untuk project baru.                                                                                    |
| HTTP Client   | net/http (built-in)     | —                        | Untuk panggil ip-api.com. Tidak perlu library tambahan.                                                                                                                                 |
| Dev Tooling   | Air                     | latest                   | Live reload untuk development. Setara `nodemon` di Node.js.                                                                                                                             |

**Tentang "LTS" Go:**
Go tidak punya LTS. Tim Go merekomendasikan selalu pakai versi terbaru. Go terkenal menjaga backward compatibility sangat ketat (Go 1 Compatibility Promise) — hampir tidak ada breaking change antar versi major. Go 1.26 adalah pilihan yang aman untuk produksi, dan tetap didukung setidaknya sampai Go 1.28 rilis (~Februari 2027).

### Pendekatan Arsitektur Go

Go memiliki filosofi yang sangat berbeda dari NestJS dan Spring Boot. Tidak ada DI container, tidak ada magic annotation, tidak ada reflection-heavy framework. Semua eksplisit dan manual.

**Struktur project Go (standar komunitas):**
```
tracker/
├── cmd/
│   └── api/
│       └── main.go          # entry point, inisialisasi semua dependency
├── internal/
│   ├── config/              # baca env vars
│   ├── database/            # koneksi PostgreSQL + GORM setup
│   ├── redis/               # koneksi go-redis
│   ├── handler/             # HTTP handlers (setara Controller)
│   ├── service/             # logika bisnis
│   ├── repository/          # akses database
│   ├── middleware/          # auth middleware, IP extraction
│   ├── model/               # struct untuk database entities
│   └── dto/                 # struct untuk request/response
├── migrations/              # file SQL migration
├── pkg/
│   ├── jwt/                 # helper JWT
│   └── enricher/            # ip-api.com client
└── go.mod
```

**Dependency Injection Manual:**
Di Go, tidak ada container. Semua dependency di-construct di `main.go` dan di-pass lewat constructor. Ini terlihat verbose tapi sangat jelas — kamu tahu persis apa yang bergantung pada apa. Contoh alurnya: `main.go` buat koneksi DB → buat Redis client → buat semua repository (terima DB) → buat semua service (terima repository + Redis) → buat semua handler (terima service) → register route di Gin.

**Interface sebagai kontrak:**
Go menggunakan implicit interface (duck typing). Sebuah struct mengimplementasikan interface jika punya semua method yang dibutuhkan — tidak perlu kata kunci `implements`. Ini sangat berguna untuk testing: buat mock struct yang implementasikan interface repository, inject ke service, test service secara isolated tanpa database.

**Error Handling:**
Go tidak punya exceptions. Setiap fungsi yang bisa gagal return `(value, error)`. Caller harus selalu handle error ini secara eksplisit. Pattern umumnya: `if err != nil { return nil, err }`. Ini lebih verbose tapi membuat error flow sangat jelas — tidak ada silent failures.

**Goroutines untuk IP Enrichment:**
IP enrichment (panggil ip-api.com) tidak perlu tunggu hasilnya sebelum kirim response ke client. Di Go, ini dilakukan dengan goroutine: `go enricher.EnrichAsync(ip, visitorID)`. Goroutine adalah lightweight thread — biayanya sangat kecil. Ini lebih elegant dari pendekatan async di NestJS/Spring Boot.

**Middleware di Gin:**
Gin middleware adalah fungsi yang menerima `*gin.Context` dan memanggil `c.Next()` untuk meneruskan ke handler berikutnya. Auth API key dan JWT diimplementasikan sebagai middleware yang di-attach ke route group tertentu.

**GORM di Go:**
GORM v2 mendukung decorator-style dengan struct tags: `gorm:"primaryKey"`, `gorm:"uniqueIndex"`, `gorm:"column:api_key"`. Migration bisa dilakukan via `db.AutoMigrate()` untuk development (sama seperti TypeORM synchronize) atau via golang-migrate untuk production. **Rekomendasi: pakai golang-migrate untuk production**, GORM AutoMigrate hanya untuk development.

**Catatan spesifik Go:**
- Tidak ada hot reload built-in — pakai `Air` untuk development.
- Build menghasilkan single binary statically linked — tidak perlu runtime. Deploy cukup copy binary ke server. Ini keunggulan besar dibanding Node.js dan Java.
- Memory usage jauh lebih rendah dari Node.js dan Java — Go bisa berjalan dalam ~20-30MB RAM vs ~150MB+ untuk Node.js dan ~200MB+ untuk JVM.
- context.Context harus di-pass ke setiap function yang melakukan I/O — ini adalah idiom Go untuk cancellation dan timeout propagation.
- `pgx` driver (lewat GORM adapter) jauh lebih performa dari `lib/pq` yang lama — pastikan pakai `gorm.io/driver/postgres` yang sudah pakai pgx v5.

---

## Yang Sama di Semua Versi

Bagian ini berlaku identik untuk NestJS, Spring Boot, dan Go.

### Database Schema (PostgreSQL 17.x)

Lima tabel dengan relasi yang sama di semua versi. Perbedaan hanya di tool migration yang dipakai.

**Tabel `sites`**
Menyimpan website terdaftar. Kolom utama: `id` (UUID), `name`, `domain` (unique), `api_key` (unique, di-generate saat daftarkan website), `is_active`, `created_at`.

**Tabel `visitors`**
Satu baris per unique visitor berdasarkan fingerprint. Kolom utama: `id` (UUID), `fingerprint_id` (unique), `visit_count`, `country`, `city`, `isp`, `timezone`, `first_seen_at`, `last_seen_at`.

**Tabel `visit_logs`**
Satu baris per kunjungan (bisa banyak per visitor). Kolom utama: `id`, `visitor_id` (FK ke visitors), `site_id` (FK ke sites), `ip`, `page_url`, `referrer`, `user_agent`, `browser`, `os`, `device_type`, `screen_res`, `language`, `created_at`.

**Tabel `fingerprint_components`**
Raw data fingerprint untuk investigasi forensik. Kolom utama: `id`, `visitor_id` (FK, unique — satu baris per visitor), `canvas_hash`, `webgl_hash`, `audio_hash`, `raw` (JSONB untuk semua komponen FingerprintJS mentah).

**Tabel `blocked_ips`**
Daftar IP yang diblock. Kolom utama: `id`, `ip` (unique), `reason`, `blocked_by`, `expires_at` (NULL = permanent), `created_at`.

**Index yang penting untuk performa:**
- `visitors.fingerprint_id` — dicari setiap POST /v1/track
- `visit_logs.visitor_id` — join ke visitors
- `visit_logs.created_at` — query analytics per range waktu
- `blocked_ips.ip` — cek blocklist di fallback (saat Redis down)

### Redis Key Structure

Sama di semua versi. Redis dipakai untuk dua tujuan:

**IP Blocklist cache:** Key `blocklist:ip:{ip_address}`, value JSON berisi `reason` dan `expires_at`. TTL di-set sama dengan `expires_at` jika ada, atau no-expiry jika permanent. Ini yang paling sering diakses — setiap POST /v1/track.

**Site API key cache:** Key `site:key:{api_key}`, value JSON data site. TTL 300 detik (5 menit). Mengurangi database query untuk validasi API key yang sama berulang kali.

### API Endpoints (Sama di Semua Versi)

| Method   | Endpoint                      | Auth       | Deskripsi                                             |
| -------- | ----------------------------- | ---------- | ----------------------------------------------------- |
| `POST`   | `/v1/track`                   | X-Site-Key | Terima fingerprint + visit data dari tracker.js       |
| `GET`    | `/v1/blocklist/check/:ip`     | — (publik) | Fast check IP dari Redis. Dipakai middleware website. |
| `POST`   | `/v1/auth/login`              | —          | Login admin, dapat JWT                                |
| `GET`    | `/v1/visitors`                | JWT        | List visitor dengan pagination dan filter             |
| `GET`    | `/v1/visitors/:fingerprintId` | JWT        | Detail visitor + 50 log terakhir                      |
| `GET`    | `/v1/sites`                   | JWT        | List sites terdaftar                                  |
| `POST`   | `/v1/sites`                   | JWT        | Daftarkan site baru, auto-generate API key            |
| `DELETE` | `/v1/sites/:id`               | JWT        | Nonaktifkan site                                      |
| `GET`    | `/v1/blocklist`               | JWT        | List semua blocked IP                                 |
| `POST`   | `/v1/blocklist`               | JWT        | Block IP (dengan optional expiry)                     |
| `DELETE` | `/v1/blocklist/:ip`           | JWT        | Unblock IP                                            |
| `GET`    | `/v1/analytics/overview`      | JWT        | Summary: total, top country, chart 30 hari            |

### Alur Data (Sama di Semua Versi)

1. Halaman website dimuat → `<script src="tracker.js" data-site-key="...">` di-load async
2. tracker.js load FingerprintJS v4 → generate fingerprint ID dari karakteristik browser
3. tracker.js kirim `POST /v1/track` — payload: fingerprint_id, page_url, referrer, UA, screen, language, timezone, komponen raw
4. Server validasi `X-Site-Key` header → cek Redis cache → jika miss, query PostgreSQL
5. Server cek Redis: `GET blocklist:ip:{ip}` — jika blocked, return `{ blocked: true }` langsung
6. Server query: apakah visitor dengan fingerprint ini sudah ada? Jika belum, buat baru + enrichment IP via ip-api.com (async/non-blocking)
7. Jika visitor sudah ada: update `last_seen_at` + increment `visit_count`
8. Simpan baris baru di `visit_logs`
9. Return `{ tracked: true, blocked: false }` ke client
10. tracker.js dispatch event `tracker:ready` (dan `tracker:blocked` jika applicable)

### Client SDK — tracker.js (Sama di Semua Versi)

tracker.js berjalan di browser client, tidak terkait dengan bahasa backend. Cara embed:

```html
<script
  src="https://tracker.fts-tech.co.id/sdk/tracker.js"
  data-site-key="fts_namawebsite_xxxxx"
  async>
</script>
```

Cara tracker.js bekerja: load FingerprintJS v4 → generate visitor ID → kumpulkan data browser → `POST /v1/track` dengan `X-Site-Key` di header. IP tidak dikirim dari browser — server yang membaca dari header `CF-Connecting-IP` (Cloudflare) → `X-Forwarded-For` → `req.ip`.

Jika response berisi `blocked: true`, script dispatch event `tracker:blocked`. Default behavior-nya redirect ke `/blocked`. Bisa di-override dengan menset `window.__trackerBlockHandled = true` sebelum script load.

---

## Deployment

### Semua Versi — Infrastruktur yang Sama

- **Domain:** `tracker.fts-tech.co.id` (Cloudflare wildcard `*.fts-tech.co.id` sudah aktif)
- **VPS:** srv1142454 IP 31.97.109.89 (Plesk, Hostinger)
- **Database:** PostgreSQL 17.x — buat database baru `tracker_db` dan user `tracker_user`
- **Redis:** Install Redis 8.x di VPS, bind ke `127.0.0.1` saja (tidak perlu expose ke publik)
- **Reverse proxy:** Plesk nginx forward traffic `tracker.fts-tech.co.id` ke port lokal aplikasi
- **SSL:** Cloudflare handle SSL termination (Full mode)
- **SDK static file:** `tracker.js` di-serve langsung oleh nginx dari folder `sdk/` dengan header `Access-Control-Allow-Origin: *` dan `Cache-Control: public, max-age=3600`

### Spesifik per Versi

**NestJS:** Jalan di port 3100. `npm run build` → `pm2 start ecosystem.config.js`. Plesk proxy rule ke `localhost:3100`.

**Spring Boot:** Jalan di port 8080 (default) atau custom. Build dengan `./mvnw package` → hasilkan `tracker.jar`. Jalankan via systemd service atau `pm2` dengan `pm2 start "java -jar tracker.jar" --name tracker-api`. Atau pakai GraalVM native image untuk startup <100ms.

**Go:** `go build -o tracker ./cmd/api/` → hasilkan single binary `tracker`. Copy ke server, jalankan langsung via pm2 atau systemd. Tidak perlu runtime environment — binary sudah self-contained. Ini keunggulan terbesar Go untuk deployment ke VPS.

---

## Perbandingan Ketiga Versi

### Karakteristik Teknis

| Aspek                 | NestJS                      | Spring Boot               | Go                              |
| --------------------- | --------------------------- | ------------------------- | ------------------------------- |
| **Bahasa**            | TypeScript                  | Java                      | Go                              |
| **Paradigma**         | OOP + Module DI             | OOP + Spring IoC          | Procedural + Interfaces         |
| **Startup time**      | ~2–4 detik                  | ~3–8 detik (JVM)          | **< 100ms**                     |
| **Memory usage**      | ~120–200 MB                 | ~250–500 MB               | **~20–50 MB**                   |
| **Throughput (est.)** | Medium-High                 | High                      | **Highest**                     |
| **Build output**      | JS files + node_modules     | Fat JAR (50–100 MB)       | **Single binary (< 20 MB)**     |
| **Deployment**        | Node.js harus ada di server | JVM harus ada di server   | **Copy binary, langsung jalan** |
| **Learning curve**    | Rendah (familiar NestJS)    | Sedang (Java verbose)     | Rendah–Sedang                   |
| **Ecosystem**         | npm (terbesar)              | Maven Central (mature)    | Go modules (growing)            |
| **ORM maturity**      | TypeORM 1.0.0 (new major)   | Hibernate (paling mature) | GORM v2 (baik)                  |
| **Hot reload dev**    | `--watch` NestJS            | Spring DevTools           | Air                             |

### Pertimbangan Non-Teknis

**Konsistensi dengan codebase FTS yang ada:**
FTS sudah punya codebase TypeScript (NestJS di WhatsApp platform) dan PHP (Laravel). NestJS paling konsisten dengan stack yang sudah ada. Tim tidak perlu belajar bahasa baru.

**Interoperabilitas tim:**
Jika tim lain di FTS perlu maintain sistem ini, TypeScript paling mudah dipelajari karena mirip PHP dalam banyak hal. Go memerlukan paradigma baru yang berbeda. Java memerlukan setup yang lebih berat.

**Ekosistem library fingerprinting:**
FingerprintJS adalah library JavaScript. Tidak ada library Go atau Java yang setara untuk *server-side* fingerprinting. Tapi karena fingerprinting dilakukan di **client browser** (bukan server), ini tidak relevan — semua versi backend terima data fingerprint yang dikirim oleh tracker.js.

### Rekomendasi: Kapan Pilih Mana

**Pilih NestJS jika:**
- Tim sudah familiar TypeScript/NestJS (seperti project WhatsApp platform FTS)
- Ingin konsistensi dengan stack yang sudah ada
- Prioritas adalah kecepatan development, bukan performa raw
- Tidak ada requirement khusus soal memori rendah

**Pilih Spring Boot jika:**
- Ada tim Java yang available
- Butuh fitur enterprise matang (structured logging, actuator, Flyway, Spring Security)
- Sistem ini akan berkembang menjadi platform besar dengan banyak fitur
- Butuh virtual threads untuk high concurrency tanpa reactive programming

**Pilih Go jika:**
- Performa dan efisiensi memori adalah prioritas utama
- Deployment sesederhana mungkin (copy binary)
- Tim mau belajar Go (worth it untuk jangka panjang)
- Sistem tracker ini akan menjadi high-traffic service tersendiri

**Rekomendasi untuk konteks FTS:**
Mengingat kamu sudah punya NestJS di WhatsApp platform dan team familiar TypeScript, **NestJS adalah pilihan paling pragmatis untuk mulai sekarang**. Jika di masa depan tracker ini perlu handle traffic sangat besar dan resource VPS terbatas, pertimbangkan migrasi ke Go.

---

## Fase Pengerjaan (Sama di Semua Versi)

Fase dibuat identik karena fungsionalitasnya sama. Yang berbeda hanya pilihan tool dan library per versi.

### Fase 1 — Fondasi & Tracking
Estimasi: 2–3 hari kerja.
Setup project, koneksi database dan Redis, modul Sites dengan generate API key, auth API key, endpoint POST /v1/track dengan upsert visitor dan save visit log, deploy ke tracker.fts-tech.co.id, serve tracker.js sebagai static file.

**Hasil:** Embed tracker.js di satu website test, data visitor masuk ke database.

### Fase 2 — Admin API
Estimasi: 2 hari kerja.
Login admin dengan JWT, endpoint list visitor dengan pagination dan filter, endpoint detail visitor, CRUD blocklist, sync Redis dari PostgreSQL saat startup.

**Hasil:** Bisa query data dan block IP pertama via Postman atau dashboard sederhana.

### Fase 3 — Enrichment & Integrasi
Estimasi: 1–2 hari kerja.
Integrasi ip-api.com untuk data geografis (dengan timeout dan fail-open), rate limiting di endpoint /v1/track, endpoint analytics overview, contoh middleware Laravel dan Next.js.

**Hasil:** Data visitor lengkap dengan negara/kota/ISP, ada summary analytics.

### Fase 4 — Fitur Tambahan (Opsional)
Tidak ada estimasi — dikerjakan sesuai kebutuhan.
Export CSV, auto-sync blocklist ke Cloudflare Firewall Rules via Cloudflare API, notifikasi ke WhatsApp/Slack saat block baru, dashboard frontend Vue 3, multi-admin dengan tabel users.
