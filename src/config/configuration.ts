export interface AppConfig {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  redisUrl: string | undefined;
  siteKeyCacheTtl: number;
  ipEnricherTimeoutMs: number;
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT ?? '3100', 10),
  databaseUrl: process.env.DATABASE_URL ?? '',
  jwtSecret: process.env.JWT_SECRET ?? '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  redisUrl: process.env.REDIS_URL || undefined,
  siteKeyCacheTtl: parseInt(process.env.SITE_KEY_CACHE_TTL ?? '300', 10),
  ipEnricherTimeoutMs: parseInt(process.env.IP_ENRICHER_TIMEOUT_MS ?? '3000', 10),
});
