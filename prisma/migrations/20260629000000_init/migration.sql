-- Required for gen_random_uuid() — Prisma's `dbgenerated("gen_random_uuid()")` does not add this automatically.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "sites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "api_key" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fingerprint_id" TEXT NOT NULL,
    "visit_count" INTEGER NOT NULL DEFAULT 1,
    "country" TEXT,
    "city" TEXT,
    "isp" TEXT,
    "timezone" TEXT,
    "first_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "visitor_id" UUID NOT NULL,
    "site_id" UUID,
    "ip" VARCHAR(45) NOT NULL,
    "page_url" TEXT,
    "referrer" TEXT,
    "user_agent" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "device_type" TEXT,
    "screen_res" TEXT,
    "language" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fingerprint_components" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "visitor_id" UUID NOT NULL,
    "canvas_hash" TEXT,
    "webgl_hash" TEXT,
    "audio_hash" TEXT,
    "raw" JSONB,

    CONSTRAINT "fingerprint_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_ips" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ip" VARCHAR(45) NOT NULL,
    "reason" TEXT,
    "blocked_by" TEXT,
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_ips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sites_domain_key" ON "sites"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "sites_api_key_key" ON "sites"("api_key");

-- CreateIndex
CREATE UNIQUE INDEX "visitors_fingerprint_id_key" ON "visitors"("fingerprint_id");

-- CreateIndex
CREATE INDEX "visit_logs_visitor_id_idx" ON "visit_logs"("visitor_id");

-- CreateIndex
CREATE INDEX "visit_logs_created_at_idx" ON "visit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "fingerprint_components_visitor_id_key" ON "fingerprint_components"("visitor_id");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_ips_ip_key" ON "blocked_ips"("ip");

-- CreateIndex
CREATE UNIQUE INDEX "admins_username_key" ON "admins"("username");

-- AddForeignKey
ALTER TABLE "visit_logs" ADD CONSTRAINT "visit_logs_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "visitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_logs" ADD CONSTRAINT "visit_logs_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fingerprint_components" ADD CONSTRAINT "fingerprint_components_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "visitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
