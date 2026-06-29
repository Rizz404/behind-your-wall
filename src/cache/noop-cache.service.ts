import { Injectable } from '@nestjs/common';
import { CacheService, SetOptions } from './cache.interface';

/** Used when REDIS_URL is not configured — every read is a "miss", every write/delete is a no-op. */
@Injectable()
export class NoopCacheService implements CacheService {
  isEnabled(): boolean {
    return false;
  }

  async get(_key: string): Promise<string | null> {
    return null;
  }

  async set(_key: string, _value: string, _options?: SetOptions): Promise<void> {
    return;
  }

  async del(_key: string): Promise<void> {
    return;
  }
}
