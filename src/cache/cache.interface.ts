export const CACHE_SERVICE = Symbol('CACHE_SERVICE');

export interface SetOptions {
  /** TTL in seconds. Omit for no expiry. */
  ttlSeconds?: number;
}

export interface CacheService {
  isEnabled(): boolean;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: SetOptions): Promise<void>;
  del(key: string): Promise<void>;
}
